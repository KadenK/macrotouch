import { useMacroStore } from '~/stores/macro'
import { useWebSocket } from '~/composables/useWebSocket'

export default defineNuxtPlugin(() => {
  const store = useMacroStore()
  const ws = useWebSocket()

  // When the store updates, broadcast state changes to the server.
  store.setBroadcastFn((data) => {
    ws.send({ type: 'state-update', state: data })
  })

  // When the server broadcasts the latest state, apply it locally.
  ws.on('state', (state) => {
    store.setState(state)
  })
})
