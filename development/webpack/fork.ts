const PPID = Number(process.env.PPID);
if (isNaN(PPID) || PPID !== process.ppid) {
  throw new Error(
    `${__filename} must be run with a \`PPID\` environment variable0. See ${__dirname}/launch.ts for an example.`,
  );
}

require('./build').build(() => {
  // stop writing because the parent process is still listening to these streams
  // and we don't want any more output to be shown to the user.
  process.stdout.write = process.stderr.write = () => true;

  // use IPC if we have it, otherwise send a POSIX signal
  process.send?.('SIGUSR2') || process.kill(PPID, 'SIGUSR2');
});
