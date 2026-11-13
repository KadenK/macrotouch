import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { resolveDataRoot } from './state-file'

/**
 * Reads, writes, and checks the pairing token.
 *
 * Kept beside the state file rather than inside it: the token is a credential,
 * not user data, and `state.json` is handed to every client in full on every
 * snapshot. Mixing the two would publish it to the devices it is meant to keep
 * out.
 */

/**
 * Connections from this computer. These may stop the master, register as a
 * node, reach the editor pages, and skip the pairing token.
 *
 * Read from the real socket address, never from a header: `x-forwarded-for` is
 * client-supplied and spoofable, which is why the old `ipRedirect` check it
 * came from was not a security boundary.
 */
export const isLoopback = (address: string | undefined) =>
  address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'

/** 128 bits. Ample for a LAN secret, and short enough to keep the QR sparse. */
const TOKEN_BYTES = 16

const newToken = () => crypto.randomBytes(TOKEN_BYTES).toString('base64url')

export class PairingToken {
  readonly filePath: string
  private token: string

  constructor(dataRoot = resolveDataRoot()) {
    this.filePath = path.join(dataRoot, 'pairing.json')
    try {
      fs.mkdirSync(dataRoot, { recursive: true })
    } catch (err) {
      console.error('[Pairing] cannot create data directory', dataRoot, err)
    }
    this.token = this.load()
  }

  /** The token to advertise. Only ever sent to a client that is already trusted. */
  get value(): string {
    return this.token
  }

  /**
   * A missing or unreadable file means first run: mint one and save it.
   *
   * A corrupt file is replaced rather than repaired. The cost is that every
   * paired phone has to be re-paired, which is the same cost as a regeneration
   * and is better than refusing to start.
   */
  private load(): string {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as { token?: unknown }
      if (typeof parsed.token === 'string' && parsed.token.length > 0) return parsed.token
      console.warn('[Pairing] token file has no usable token, generating a new one')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('[Pairing] cannot read token file, generating a new one:', err)
      }
    }

    const token = newToken()
    this.save(token)
    return token
  }

  /**
   * Written synchronously, unlike the state file: nothing may observe a token
   * the next start would not recognise, and a client could be refused on a
   * token that was never persisted.
   */
  private save(token: string): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify({ token }, null, 2), { encoding: 'utf-8', mode: 0o600 })
    } catch (err) {
      console.error('[Pairing] failed to save token:', err)
    }
  }

  /** Constant-time, so a wrong token cannot be narrowed down one character at a time. */
  verify(candidate: string | undefined | null): boolean {
    if (typeof candidate !== 'string' || candidate.length === 0) return false
    const a = Buffer.from(candidate)
    const b = Buffer.from(this.token)
    // Unequal lengths cannot be compared in constant time, and a length is not
    // the secret — the bytes are.
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  }

  /** Mint and persist a new token. Every device paired on the old one is now stale. */
  regenerate(): string {
    this.token = newToken()
    this.save(this.token)
    console.log('[Pairing] token regenerated')
    return this.token
  }
}
