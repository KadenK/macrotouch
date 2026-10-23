import path from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_MASTER, HTTP_PORT, WEBSOCKET_PORT } from '../shared/websocket'
import { createActionServerLauncher } from './action-server-launcher'
import { startGateway } from './gateway'
import { startHttpServer } from './http'

/**
 * The master server process.
 *
 * Runs on its own, or is started by the desktop app when none is running.
 * `MACROTOUCH_STATIC_DIR` points at the generated web apps.
 */

const wsPort = Number(process.env.WS_PORT || process.env.NUXT_WS_PORT || WEBSOCKET_PORT)
const httpPort = Number(process.env.MACROTOUCH_HTTP_PORT || process.env.PORT || HTTP_PORT)
// These will become command line options or user settings in the future, but for now they are hardcoded.
const USE_LOCAL_ACTION_SERVER = true
const masterUrl = `ws://${DEFAULT_MASTER.host}:${wsPort}`
const launcher = USE_LOCAL_ACTION_SERVER ? createActionServerLauncher({ masterUrl }) : undefined
const here = path.dirname(fileURLToPath(import.meta.url))
const staticDir = process.env.MACROTOUCH_STATIC_DIR || path.join(here, '..', '.output', 'public')

const http = startHttpServer(httpPort, staticDir)
http.on('error', (err: NodeJS.ErrnoException) => {
  console.error(`[HTTP] cannot listen on port ${httpPort}:`, err.message)
  process.exit(1)
})

let stopping = false
const stop = async () => {
  if (stopping) return
  stopping = true
  gateway.shutdown()
  http.close()
  http.closeAllConnections()
  await launcher?.stop()
  process.exit(0)
}

const gateway = startGateway(wsPort, {
  onQuit: () => {
    console.log('Quit requested, shutting down')
    void stop()
  },
})
launcher?.start()

process.once('SIGINT', stop)
process.once('SIGTERM', stop)
