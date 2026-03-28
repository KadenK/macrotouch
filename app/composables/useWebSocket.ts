import { useRuntimeConfig } from '#app'

type WebSocketMessage =
  | { type: 'state'; state: { macros: Record<string, any>; screens: Record<string, any> } }
  | { type: 'state-update'; state: { macros: Record<string, any>; screens: Record<string, any> } }

type WebSocketHandlers = {
  state?: (state: { macros: Record<string, any>; screens: Record<string, any> }) => void
  open?: () => void
  close?: () => void
  error?: (error: Event) => void
}

const createWebSocket = () => {
  const ws = ref<WebSocket | null>(null)
  const isConnected = ref(false)
  const handlers = reactive<WebSocketHandlers>({})

  const connect = () => {
    if (ws.value) return // already connected/connecting

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname
    const port = useRuntimeConfig().public.websocketPort || 3001
    ws.value = new WebSocket(`${protocol}//${host}:${port}`)

    ws.value.onopen = () => {
      isConnected.value = true
      handlers.open?.()
      console.log('WebSocket connected')
    }

    ws.value.onmessage = (event: MessageEvent) => {
      let data: WebSocketMessage | undefined
      try {
        data = JSON.parse(event.data)
      } catch {
        console.warn('Received invalid websocket message')
        return
      }

      if (!data || typeof data !== 'object' || typeof (data as any).type !== 'string') return

      if (data.type === 'state') {
        handlers.state?.(data.state)
      }
      // macro-trigger is intentionally not handled on clients; server executes actions.
    }

    ws.value.onclose = () => {
      isConnected.value = false
      handlers.close?.()
      console.log('WebSocket disconnected')
    }

    ws.value.onerror = (error: Event) => {
      handlers.error?.(error)
      console.error('WebSocket error:', error)
    }
  }

  const disconnect = () => {
    if (ws.value) {
      ws.value.close()
    }
  }

  const send = (data: WebSocketMessage) => {
    if (ws.value && isConnected.value) {
      ws.value.send(JSON.stringify(data))
    }
  }

  const on = <T extends keyof WebSocketHandlers>(event: T, handler: NonNullable<WebSocketHandlers[T]>) => {
    handlers[event] = handler as any
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
