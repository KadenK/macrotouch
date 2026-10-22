export const WEBSOCKET_PORT = 4322
export const HTTP_PORT = 4321

/**
 * Where the master server listens. Electron and the web apps read this one
 * place, so pointing them at a remote master later is a single change.
 */
export const DEFAULT_MASTER = {
  host: '127.0.0.1',
  httpPort: HTTP_PORT,
  wsPort: WEBSOCKET_PORT,
}
