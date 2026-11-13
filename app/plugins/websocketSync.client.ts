import { useMacroStore } from '~/stores/macro'
import { usePairingToken } from '~/composables/usePairingToken'
import { useWebSocket } from '~/composables/useWebSocket'

export default defineNuxtPlugin(() => {
  const store = useMacroStore()
  const ws = useWebSocket()
  const { setHostToken } = usePairingToken()

  // The store sends commands; the master owns the state and answers with patches.
  store.setSendFn((message) => ws.send(message))

  ws.on('snapshot', (snapshot) => {
    store.applySnapshot(snapshot.state, snapshot.catalogs, snapshot.actionState)
    // Only a local editor is told the token (MAC-31), so this is also what
    // decides whether the connect page has a URL worth advertising.
    if (snapshot.pairingToken) setHostToken(snapshot.pairingToken)
  })
  ws.on('patch', (patch) => store.applyPatch(patch))
  ws.on('catalogs', (catalogs) => store.applyCatalogs(catalogs))
  ws.on('actionState', (states) => store.applyActionState(states))
  // After a regeneration, so the connect page redraws its QR without reconnecting.
  ws.on('pairingToken', (token) => setHostToken(token))
  ws.on('error', (error) => console.warn(`[protocol] ${error.code}: ${error.message}`))
})
