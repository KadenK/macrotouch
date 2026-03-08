export const useWebSocket = () => {
  const ws = ref<WebSocket | null>(null)
  const isConnected = ref(false)

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
      // Handle macro updates
      if (data.type === 'macro-update') {
        // Update macros
        console.log('Macros updated:', data.macros)
        // Emit or update store
      } else if (data.type === 'macro-trigger') {
        // Execute macro on host
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

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return {
    isConnected: readonly(isConnected),
    send,
  }
}
