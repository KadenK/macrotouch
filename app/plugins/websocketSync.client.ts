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
    store.applySnapshot(snapshot.state, snapshot.catalogs, snapshot.actionState, snapshot.nodes)
    // Only a local editor is told the token (MAC-31), so this is also what
    // decides whether the connect page has a URL worth advertising.
    if (snapshot.pairingToken) setHostToken(snapshot.pairingToken)
  })
  ws.on('patch', (patch) => store.applyPatch(patch))
  ws.on('catalogs', (message) => store.applyCatalogs(message.catalogs, message.nodes))
  ws.on('actionState', (states) => store.applyActionState(states))
  ws.on('actionResult', (result) => {
    if (!store.applyActionResult(result) && !result.ok) store.reportActionError(result.error.message)
  })
  // After a regeneration, so the connect page redraws its QR without reconnecting.
  ws.on('pairingToken', (token) => setHostToken(token))
  ws.on('error', (error) => console.warn(`[protocol] ${error.code}: ${error.message}`))
})
