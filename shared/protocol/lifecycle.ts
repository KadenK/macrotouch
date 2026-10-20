/**
 * Electron to master, on exit: shut down.
 *
 * The master stops its local Action Server before it goes.
 */
export interface Quit {
  type: 'quit'
}
