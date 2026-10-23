import { useMacroStore } from '~/stores/macro'
import { useWebSocket } from '~/composables/useWebSocket'

export default defineNuxtPlugin(() => {
  const store = useMacroStore()
  const ws = useWebSocket()

  // The store sends commands; the master owns the state and answers with patches.
  store.setSendFn((message) => ws.send(message))

  ws.on('snapshot', (snapshot) => store.applySnapshot(snapshot.state, snapshot.catalogs))
  ws.on('patch', (patch) => store.applyPatch(patch))
  ws.on('catalogs', (catalogs) => store.applyCatalogs(catalogs))
  ws.on('error', (error) => console.warn(`[protocol] ${error.code}: ${error.message}`))
})
