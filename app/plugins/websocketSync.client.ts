import { useMacroStore } from '~/stores/macro'
import { useWebSocket } from '~/composables/useWebSocket'

export default defineNuxtPlugin(() => {
  const store = useMacroStore()
  const ws = useWebSocket()

  // When the store updates, broadcast state changes to the server.
  // macro-trigger events go directly to server; state updates are wrapped.
  store.setBroadcastFn((data) => {
    if (data && typeof data === 'object' && (data as any).type === 'macro-trigger') {
      ws.send(data as any)
    } else {
      ws.send({ type: 'state-update', state: data })
    }
  })

  // When the server broadcasts the latest state, apply it locally.
  ws.on('state', (state) => {
    store.setState(state)
  })
})
