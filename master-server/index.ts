import path from 'path'
import { fileURLToPath } from 'url'
import { HTTP_PORT, WEBSOCKET_PORT } from '../shared/websocket'
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
const here = path.dirname(fileURLToPath(import.meta.url))
const staticDir = process.env.MACROTOUCH_STATIC_DIR || path.join(here, '..', '.output', 'public')

const http = startHttpServer(httpPort, staticDir)
http.on('error', (err: NodeJS.ErrnoException) => {
  console.error(`[HTTP] cannot listen on port ${httpPort}:`, err.message)
  process.exit(1)
})

const gateway = startGateway(wsPort, {
  onQuit: () => {
    console.log('Quit requested, shutting down')
    gateway.shutdown()
    http.close()
    http.closeAllConnections()
    process.exit(0)
  },
})

const stop = () => {
  http.close()
  http.closeAllConnections()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
