import { ref, onMounted, onUnmounted, readonly } from 'vue'

export const useWebSocket = () => {
  const ws = ref<WebSocket | null>(null)
  const isConnected = ref(false)
  const messageHandlers: ((data: any) => void)[] = [] // store all listeners

  const connect = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname
    ws.value = new WebSocket(`${protocol}//${host}:3001`)

    if (!ws.value) return

    ws.value.onopen = () => {
      isConnected.value = true
      console.log('WebSocket connected')
    }

    ws.value.onmessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data)

      // 1. Notify all registered handlers (store, etc.)
      messageHandlers.forEach(handler => handler(data))

      // 2. Special case: macro-trigger for Electron
      if (data.type === 'macro-trigger') {
        // @ts-expect-error
        const electronAPI = window.electronAPI
        if (electronAPI) {
          electronAPI.send('macro:trigger', data.id)
        }
      }
    }

    ws.value.onclose = () => {
      isConnected.value = false
      console.log('WebSocket disconnected')
    }

    ws.value.onerror = (error: Event) => {
      console.error('WebSocket error:', error)
    }
  }

  const disconnect = () => {
    if (ws.value) {
      ws.value.close()
    }
  }

  const send = (data: Record<string, unknown>) => {
    if (ws.value && isConnected.value) {
      ws.value.send(JSON.stringify(data))
    }
  }

  // Add this function to allow external listeners
  const onMessage = (handler: (data: any) => void) => {
    messageHandlers.push(handler)
  }

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return {
    isConnected: readonly(isConnected),
    send,
    onMessage,
  }
}
