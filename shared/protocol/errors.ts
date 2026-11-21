export type ProtocolErrorCode =
  | 'unsupported-protocol-version'
  | 'invalid-message'
  | 'invalid-token'
  | 'node-offline'
  | 'unknown-macro'
  | 'unknown-screen'
  | 'unknown-action'
  | 'action-failed'
  /** The action's plugin does not support this node's OS. */
  | 'unsupported-platform'
  /** The action cannot run on this node now: a missing app or tool, not ready, or not configured. `details` carries its `Availability`. */
  | 'action-unavailable'
  /** The plugin threw or timed out. */
  | 'plugin-error'
  /** Only the local editor may do this (install, remove, configure plugins). */
  | 'forbidden'
  /** A plugin package failed validation. `message` says why. */
  | 'invalid-plugin'
  | 'unknown-plugin'

export interface ProtocolError {
  code: ProtocolErrorCode
  message: string
  details?: unknown
}

/**
 * A failure with no request to attach it to: a malformed message, a command
 * naming something that does not exist, a version mismatch at handshake, a
 * missing or wrong pairing token.
 *
 * Failures that *do* belong to a request travel on `action-result` instead, so
 * the caller can match them to what it sent.
 */
export interface ProtocolErrorMessage {
  type: 'error'
  error: ProtocolError
  /** Set when the failure can still be traced back to a request. */
  requestId?: string
}
