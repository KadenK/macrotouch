import type { ClientToMasterMessage, ProtocolError, StateCommand } from '../../shared/protocol'

/**
 * Turns a raw socket frame into a typed message, or says why it can't.
 *
 * The types in `shared/protocol` are erased at build; nothing checks a message
 * that actually arrives off the network. This is that check. Before MAC-40 the
 * only guard was `typeof data === 'object' && 'type' in data`, after which a
 * client-supplied object was written straight to `state.json`.
 */

const fail = (message: string, details?: unknown): ProtocolError => ({
  code: 'invalid-message',
  message,
  ...(details === undefined ? {} : { details }),
})

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const isStr = (v: unknown): v is string => typeof v === 'string'
const isPos = (v: unknown): boolean => isObj(v) && typeof v.row === 'number' && typeof v.column === 'number'

/** A macro/screen is checked for the fields the store actually dereferences. */
const isMacro = (v: unknown): boolean => isObj(v) && isStr(v.id)
const isScreen = (v: unknown): boolean =>
  isObj(v) &&
  isStr(v.id) &&
  isObj(v.size) &&
  typeof (v.size as Record<string, unknown>).rows === 'number' &&
  typeof (v.size as Record<string, unknown>).columns === 'number' &&
  Array.isArray(v.macroRows)

function validateCommand(m: Record<string, unknown>): StateCommand | ProtocolError {
  switch (m.type) {
    case 'upsert-macro':
      if (!isMacro(m.macro)) return fail('upsert-macro requires a macro with an id')
      if (m.placement !== undefined) {
        const p = m.placement
        if (!isObj(p) || !isStr(p.screenId) || !isPos(p.position)) {
          return fail('upsert-macro placement requires screenId and position')
        }
      }
      return m as unknown as StateCommand
    case 'delete-macro':
      if (!isStr(m.screenId) || !isPos(m.position)) return fail('delete-macro requires screenId and position')
      return m as unknown as StateCommand
    case 'move-macro':
      if (!isStr(m.screenId) || !isPos(m.from) || !isPos(m.to)) {
        return fail('move-macro requires screenId, from and to')
      }
      return m as unknown as StateCommand
    case 'upsert-screen':
      if (!isScreen(m.screen)) return fail('upsert-screen requires a screen with id, size and macroRows')
      return m as unknown as StateCommand
    case 'delete-screen':
      if (!isStr(m.screenId)) return fail('delete-screen requires screenId')
      return m as unknown as StateCommand
    case 'update-settings':
      if (!isObj(m.settings)) return fail('update-settings requires a settings object')
      return m as unknown as StateCommand
    default:
      return fail(`Unknown message type: ${String(m.type)}`)
  }
}

export function parseClientMessage(raw: string): ClientToMasterMessage | ProtocolError {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fail('Message is not valid JSON')
  }

  if (!isObj(parsed)) return fail('Message is not an object')
  if (!isStr(parsed.type)) return fail('Message has no type')

  switch (parsed.type) {
    case 'hello': {
      if (typeof parsed.protocolVersion !== 'number') return fail('hello requires a numeric protocolVersion')
      const role = parsed.role
      if (role !== 'editor' && role !== 'controller') {
        // A browser client cannot announce itself as a node — the direction
        // union says so, and so does this.
        return fail(`hello role must be editor or controller, got ${String(role)}`)
      }
      if (role === 'controller' && parsed.screenId !== undefined && !isStr(parsed.screenId)) {
        return fail('controller hello screenId must be a string when present')
      }
      return parsed as unknown as ClientToMasterMessage
    }
    case 'macro-trigger':
      if (!isStr(parsed.requestId)) return fail('macro-trigger requires requestId')
      if (!isStr(parsed.macroId)) return fail('macro-trigger requires macroId')
      return parsed as unknown as ClientToMasterMessage
    case 'view-screen':
      if (parsed.screenId !== null && !isStr(parsed.screenId)) {
        return fail('view-screen requires screenId as a string or null')
      }
      return parsed as unknown as ClientToMasterMessage
    default:
      return validateCommand(parsed) as ClientToMasterMessage | ProtocolError
  }
}
