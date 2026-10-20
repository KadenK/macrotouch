/**
 * Version of the message protocol defined in this directory.
 *
 * Every `hello` carries it. Bump it whenever a change would stop an older peer
 * from reading a newer message, or vice versa.
 */
export const PROTOCOL_VERSION = 1

export type ProtocolVersion = typeof PROTOCOL_VERSION
