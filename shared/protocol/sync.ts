import type { Macro } from '../types/macro'
import type { MacroScreen } from '../types/screen'
import type { MacroSettings } from '../types/state'

/**
 * Master to every client, after a command changes the state.
 *
 * A patch describes the entities that changed, not the command that changed
 * them: the master may coalesce or reject commands, and a reconnecting client
 * needs the same apply path either way. `null` is a removal — distinct from an
 * absent key, which means untouched.
 */
export interface StatePatch {
  type: 'state-patch'
  macros?: Record<string, Macro | null>
  screens?: Record<string, MacroScreen | null>
  settings?: Partial<MacroSettings>
}
