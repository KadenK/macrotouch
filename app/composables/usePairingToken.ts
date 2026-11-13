import { ref, readonly } from 'vue'

/**
 * The pairing token, from both ends of it.
 *
 * A device off the host computer has to present the token on every page request
 * and on the websocket handshake (MAC-31). The only thing such a device is ever
 * given is the URL from the connect page, so that URL is where this reads it
 * from, and local storage is what keeps it across a navigation that drops the
 * query string.
 *
 * The host itself is exempt by its socket address and never holds a client
 * token; what it holds instead is {@link hostToken}, the token it advertises.
 */

const STORAGE_KEY = 'macrotouch.pairingToken'
export const TOKEN_QUERY_KEY = 'token'

/** The token this device presents. Empty on the host, which needs none. */
const clientToken = ref('')

/**
 * The token this host advertises, from the snapshot.
 *
 * The master sends it to a local editor only, so on every other client this
 * stays empty — which is also what tells the connect page and the regenerate
 * button whether they have anything to show.
 */
const hostToken = ref('')

const readStored = (): string => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    // Private mode, or storage disabled. The URL is still the primary source.
    return ''
  }
}

const writeStored = (token: string): void => {
  try {
    localStorage.setItem(STORAGE_KEY, token)
  } catch {
    // Nothing to do: the token in the URL still carries this page load.
  }
}

let initialized = false

/**
 * The URL wins over the stored copy, and replaces it.
 *
 * Scanning a freshly regenerated QR code is how a phone re-pairs after the
 * token is rotated, so a token arriving in the URL has to overwrite whatever
 * was kept from last time rather than be ignored as already-present.
 */
const initialize = () => {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const fromUrl = new URLSearchParams(window.location.search).get(TOKEN_QUERY_KEY)
  if (fromUrl) {
    clientToken.value = fromUrl
    writeStored(fromUrl)
    return
  }
  clientToken.value = readStored()
}

/** `url` carrying `token`, or unchanged when there is no token to add. */
export const withToken = (url: string, token: string): string => {
  if (!token) return url
  const base = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  const parsed = new URL(url, base)
  parsed.searchParams.set(TOKEN_QUERY_KEY, token)
  return parsed.toString()
}

export const usePairingToken = () => {
  initialize()

  return {
    clientToken: readonly(clientToken),
    hostToken: readonly(hostToken),
    /** Called by the sync plugin from the snapshot and from `pairing-token`. */
    setHostToken: (token: string) => {
      hostToken.value = token
    },
    /** This device's own links, so a navigation does not lose the pairing. */
    withClientToken: (url: string) => withToken(url, clientToken.value),
  }
}
