// note: minimize non-`type` imports to decrease load time.
import { join } from 'node:path';
import {
  spawn,
  type SpawnOptions,
  type StdioOptions,
} from 'node:child_process';
import parser from 'yargs-parser';
import type { Child, Process, PTY, Stdio, StdName, WriteStream } from './types';

const [command, _, ...argv] = process.argv;

const alias = { cache: 'c', help: 'h', watch: 'h' };
type Args = { [x in keyof typeof alias]?: boolean };
const args = parser(argv, { alias, boolean: Object.keys(alias) }) as Args;

if (args.cache === false || args.help === true || args.watch === true) {
  // there are no time savings to running the build in a child process if the
  // cache is disabled, we need to output "help", or we're in watch mode.
  import(join(__dirname, 'build.ts')).then(({ build }) => build());
} else {
  fork(process, command, join(__dirname, 'fork.ts'), argv);
}

function fork(process: Process, command: string, file: string, argv: string[]) {
  const env = { NODE_OPTIONS: '', ...process.env, PPID: `${process.pid}` };
  // node recommends using 75% of the available memory for `max-old-space-size`
  // https://github.com/nodejs/node/blob/dd67bf08cb1ab039b4060d381cc68179ee78701a/doc/api/cli.md#--max-old-space-sizesize-in-megabytes
  // and `--max-semi-space-size=128` and `--huge-max-old-generation-size` reduce garbage collection pauses
  const maxOldSpace = ~~((require('node:os').totalmem() * 0.75) / (1 << 20));
  env.NODE_OPTIONS += ` --max-old-space-size=${maxOldSpace} --max-semi-space-size=128 --stack-trace-limit=0`;

  // run the build in a child process so that we can exit the parent process as
  // soon as the build completes, but let the cache serialization finish in the
  // background (the cache can take 30% of build-time to serialize and persist).
  const { connect, destroy, stdio } = createOutputStreams(process);

  const options: SpawnOptions = { detached: true, env, stdio };
  spawn(command, [...process.execArgv, file, ...argv], options)
    .once('close', destroy) // clean up if the child crashes
    .once('spawn', connect);
}

function createOutputStreams(process: Process) {
  const { isatty } = require('node:tty');
  const isWindows = process.platform === 'win32';
  // use IPC for communication on Windows, as it doesn't support POSIX signals
  const ipc = isWindows ? 'ipc' : 'ignore';
  const outs = (['stdout', 'stderr'] as const).map(function createStream(name) {
    const parentStream = process[name];
    return !isWindows && isatty(parentStream.fd)
      ? createTTYStream(parentStream)
      : createNonTTYStream(parentStream, name);
  }) as [Stdio, Stdio];

  return {
    connect(this: Child, child = this) {
      // hook up the child's stdio to the parent's & unref so we can exit later
      outs.forEach((stream) => (stream.listen(child), stream.unref(child)));

      listenForShutdownSignal(child, process);

      process
        // kill the child process if we didn't exit cleanly
        .on('exit', (code) => code > 128 && child.kill(code - 128))
        // `SIGWINCH` means the terminal was resized
        .on('SIGWINCH', function handleSigwinch(signal) {
          // resize the tty's
          outs.forEach((out) => out.resize());
          // then tell the child process to update its dimensions
          child.kill(signal);
        });
    },
    destroy: () => outs.forEach((out) => out.destroy()),
    stdio: ['ignore', outs[0].pty, outs[1].pty, ipc] as StdioOptions,
  };
}

function createNonTTYStream(stream: WriteStream, name: StdName): Stdio {
  return {
    destroy: () => {},
    listen: (child: Child) => void child[name]!.pipe(stream),
    pty: 'pipe', // let Node create the Pipes
    resize: () => {},
    unref: (child: Child) => void child[name]!.unref(),
  };
}

function createTTYStream(stream: WriteStream): Stdio {
  // create a PTY (Pseudo TTY) so the child stream behaves like a TTY
  const pty = require('node-pty').open({
    cols: stream.columns,
    rows: stream.rows,
    encoding: null, // don't bother encoding since we pipe the data anyway
  }) as PTY;

  return {
    destroy: () => pty.kill(),
    listen: (child: Child) => void pty.master.pipe(stream),
    pty: pty.slave,
    resize: () => pty.resize(stream.columns, stream.rows),
    unref: (child: Child) => void (pty.master.unref(), pty.slave.unref()),
  };
}

function listenForShutdownSignal(child: Child, process: Process) {
  // exit gracefully when the child signals the parent via `SIGUSR2`
  if (child.channel) {
    child.channel.unref();
    child.on('message', (signal) => signal === 'SIGUSR2' && child.unref());
  } else {
    process.on('SIGUSR2', () => child.unref());
  }
}
