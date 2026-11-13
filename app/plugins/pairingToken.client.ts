import { usePairingToken } from '~/composables/usePairingToken'

/**
 * Keeps the pairing token on this device's URL.
 *
 * Every page request from another device has to carry it (MAC-31), and a
 * client-side navigation does not re-request the page — so without this, a
 * phone that moved between routes would be refused on its next reload, on a
 * token it is still holding.
 */
export default defineNuxtPlugin(() => {
  const { clientToken } = usePairingToken()
  const router = useRouter()

  router.beforeEach((to) => {
    if (!clientToken.value || to.query.token === clientToken.value) return true
    // Re-runs the guard once; the query now matches, so it stops there.
    return { ...to, query: { ...to.query, token: clientToken.value } }
  })
})
