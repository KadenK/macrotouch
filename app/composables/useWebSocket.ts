import { useRuntimeConfig } from '#app'
import { WEBSOCKET_PORT } from '../../shared/websocket'
import { PROTOCOL_VERSION } from '../../shared/protocol'
import type {
  ClientToMasterMessage,
  MasterToClientMessage,
  ProtocolError,
  Snapshot,
  StatePatch,
} from '../../shared/protocol'

type WebSocketHandlers = {
  snapshot?: (snapshot: Snapshot) => void
  patch?: (patch: StatePatch) => void
  error?: (error: ProtocolError) => void
  open?: () => void
  close?: () => void
  socketError?: (error: Event) => void
}

/** `/screen` is the touch runtime; everything else is the editor. */
const roleForPath = (pathname: string) => (pathname.startsWith('/screen') ? 'controller' : 'editor')

const createWebSocket = () => {
  const ws = ref<WebSocket | null>(null)
  const isConnected = ref(false)
  const handlers = reactive<WebSocketHandlers>({})

  const connect = () => {
    if (ws.value) return // already connected/connecting

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname
    const port = useRuntimeConfig().public.websocketPort || WEBSOCKET_PORT
    ws.value = new WebSocket(`${protocol}//${host}:${port}`)

    ws.value.onopen = () => {
      isConnected.value = true
      // hello first, always. The master answers with a snapshot.
      send({
        type: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        role: roleForPath(window.location.pathname),
      })
      handlers.open?.()
      console.log('WebSocket connected')
    }

    ws.value.onmessage = (event: MessageEvent) => {
      let data: MasterToClientMessage | undefined
      try {
        data = JSON.parse(event.data)
      } catch {
        console.warn('Received invalid websocket message')
        return
      }

      if (!data || typeof data !== 'object' || !('type' in data)) return

      switch (data.type) {
        case 'snapshot':
          handlers.snapshot?.(data)
          break
        case 'state-patch':
          handlers.patch?.(data)
          break
        case 'error':
          handlers.error?.(data.error)
          break
        // action-result and action-state have no producer until MAC-41 / Demo 2.
      }
    }

    // No reconnect: the page must be reloaded after a server restart. Adding a
    // retry here would be a behavior change unrelated to this ticket.
    ws.value.onclose = () => {
      isConnected.value = false
      handlers.close?.()
      console.log('WebSocket disconnected')
    }

    ws.value.onerror = (error: Event) => {
      handlers.socketError?.(error)
      console.error('WebSocket error:', error)
    }
  }

  const disconnect = () => {
    if (ws.value) {
      ws.value.close()
    }
  }

  const send = (data: ClientToMasterMessage) => {
    if (ws.value && ws.value.readyState === 1) {
      ws.value.send(JSON.stringify(data))
    }
  }

  const on = <T extends keyof WebSocketHandlers>(event: T, handler: NonNullable<WebSocketHandlers[T]>) => {
    handlers[event] = handler
  }

  return {
    isConnected: readonly(isConnected),
    connect,
    disconnect,
    send,
    on,
  }
}

let singleton: ReturnType<typeof createWebSocket> | null = null

export const useWebSocket = () => {
  if (!singleton) {
    singleton = createWebSocket()
    if (typeof window !== 'undefined') {
      singleton.connect()
    }
  }
  return singleton
}
