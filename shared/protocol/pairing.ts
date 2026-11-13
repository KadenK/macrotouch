/**
 * Pairing: the token a client from another device must present.
 *
 * The master generates one on first run and keeps it next to `state.json`. A
 * connection from this computer never needs it, so the desktop editor and the
 * MacroPad window pair with no prompt; everything else sends it on `hello` and
 * in the URL it was given.
 */

/**
 * Editor to master: issue a new token and drop every remote client.
 *
 * Accepted only from this computer — a remote client cannot rotate the token
 * that is keeping it out, nor the one letting it in. The master answers with
 * {@link PairingTokenMessage}.
 */
export interface RegenerateToken {
  type: 'regenerate-token'
}

/**
 * Master to editor: the current token.
 *
 * Sent after a regeneration so the connect page can redraw its QR without
 * reconnecting. The token also rides along on {@link Snapshot} at handshake.
 */
export interface PairingTokenMessage {
  type: 'pairing-token'
  token: string
}
