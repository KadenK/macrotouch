export type ProtocolErrorCode =
  | 'unsupported-protocol-version'
  | 'invalid-message'
  | 'node-offline'
  | 'unknown-macro'
  | 'unknown-screen'
  | 'unknown-action'
  | 'action-failed'

export interface ProtocolError {
  code: ProtocolErrorCode
  message: string
  details?: unknown
}

/**
 * A failure with no request to attach it to: a malformed message, a command
 * naming something that does not exist, a version mismatch at handshake.
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
