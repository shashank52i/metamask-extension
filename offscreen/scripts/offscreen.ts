import { BrowserRuntimePostMessageStream } from '@metamask/post-message-stream';
import { ProxySnapExecutor } from '@metamask/snaps-execution-environments';

/**
 * Initialize a post message stream with the parent window that is initialized
 * in the metamask-controller (background/serivce worker) process. This will be
 * utilized by snaps for communication with snaps running in the offscreen
 * document.
 */
const parentStream = new BrowserRuntimePostMessageStream({
  name: 'child',
  target: 'parent',
});

ProxySnapExecutor.initialize(parentStream);
