import { uuid } from '../uuid'
import type { Color } from './common'
import { createColor } from './common'
import type { ActionAppearance } from './actionState'
import type { ActionStateKind } from './action'
import type { NodeId } from './node'

export enum IconSource {
  Library = 'LIBRARY',
  Filepath = 'FILEPATH',
}

export interface Icon {
  source: IconSource
  value: string
}

/** How many grid cells a macro covers, from its top-left cell. */
export interface MacroSpan {
  rows: number
  columns: number
}

export interface Macro {
  id: string
  name: string
  actionId?: string
  icon: Icon
  iconColor: Color
  backgroundColor: Color
  parameters?: Record<string, any>
  /**
   * How the macro looks for each live value of a stateful action, keyed by
   * `String(value)` (`'true'`, `'false'`). Fields left out fall back to the
   * macro's own.
   */
  stateAppearance?: Record<string, ActionAppearance>
  /**
   * The kind of live state the macro's action reports, which picks the standard face
   * a screen draws it with. Saved by the editor, since the remote has no
   * catalog to look it up in. Absent for a plain button.
   */
  stateKind?: ActionStateKind
  /**
   * The cells the macro covers. Absent means one cell. The macro's id sits in
   * its top-left cell of `macroRows`; the other cells it covers hold ''. The
   * master owns this field: an upsert never changes it, only `resize-macro`.
   */
  span?: MacroSpan
  /** The action server that runs the action. Absent: the local one (the one the master launched). */
  nodeId?: NodeId
  /**
   * The face the macro is drawn with, as its action names it (`core/value`,
   * `<pluginId>/<faceId>`). Absent: the standard face for `stateKind`. A plugin
   * face that is not loaded falls back to that too.
   */
  face?: string
  /**
   * Face settings that have no field of their own above (`icon`, the colors,
   * `stateAppearance`), keyed by section id: `text`, or a plugin's section.
   */
  faceSettings?: Record<string, unknown>
}

export function createMacro(name = 'New Macro'): Macro {
  return {
    id: uuid(),
    name,
    actionId: undefined,
    icon: { source: IconSource.Library, value: 'ic:baseline-home' },
    iconColor: createColor(0, 0, 0),
    backgroundColor: createColor(255, 255, 255),
  }
}
