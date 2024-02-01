import type { ChildProcess } from 'node:child_process';
import { type Readable } from 'node:stream';
import { type Socket } from 'node:net';
import { type IPty } from 'node-pty';

// node's ChildProcess type is incomplete
export type Child = ChildProcess & {
  stderr?: Readable & { unref: () => Readable };
  stdout?: Readable & { unref: () => Readable };
};

export type StdName = 'stdout' | 'stderr';

export interface Stdio {
  unref: (child: Child) => void;
  destroy: () => void;
  listen: (child: Child) => void;
  pty: Socket | 'pipe';
  resize: () => void;
}

export type WriteStream = NodeJS.WriteStream;

export type Process = NodeJS.Process;

export type PTY = IPty & { master: Socket; slave: Socket };
