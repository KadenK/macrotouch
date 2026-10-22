import { WEBSOCKET_PORT } from '../../shared/websocket'
import { startGateway } from '../master/gateway'

type MacroTouchGlobalScope = typeof globalThis & {
  __macroTouchWebSocketServerStarted?: boolean
}

export default defineNitroPlugin(() => {
  // Run one websocket server once even if plugin runs in multiple contexts
  const globalScope = globalThis as MacroTouchGlobalScope

  if (globalScope.__macroTouchWebSocketServerStarted) {
    return
  }
  globalScope.__macroTouchWebSocketServerStarted = true

  const port = Number(process.env.WS_PORT || process.env.NUXT_WS_PORT || WEBSOCKET_PORT)
  startGateway(port)
})
