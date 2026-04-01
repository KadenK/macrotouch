import { useMacroStore } from '~/stores/macro'
import { useWebSocket } from '~/composables/useWebSocket'
import type { WebSocketState } from '../../types'

export default defineNuxtPlugin(() => {
  const store = useMacroStore()
  const ws = useWebSocket()

  // When the store updates, broadcast state changes to the server.
  // macro-trigger events go directly to server; state updates are wrapped.
  store.setBroadcastFn((data) => {
    if (typeof data === 'object' && data !== null && 'type' in data && data.type === 'macro-trigger') {
      ws.send(data)
    } else if (typeof data === 'object' && data !== null && 'macros' in data && 'screens' in data) {
      ws.send({ type: 'state-update', state: data as WebSocketState })
    } else {
      console.warn('Ignoring unsupported broadcast payload')
    }
  })

  // When the server broadcasts the latest state, apply it locally.
  ws.on('state', (state) => {
    store.setState(state)
  })
})
