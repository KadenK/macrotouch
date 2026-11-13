import type { Component } from 'vue'
import type {
  ActionAppearance,
  ActionStateEntry,
  ActionStateInfo,
  ActionStateKind,
  ActionStateValue,
  Color,
  Icon,
  Macro,
} from '~/../shared/types'
import ButtonMacro from '~/components/macro/button/ButtonMacro.vue'
import ButtonMacroSettings from '~/components/macro/button/ButtonMacroSettings.vue'
import ToggleMacro from '~/components/macro/toggle/ToggleMacro.vue'
import ToggleMacroSettings from '~/components/macro/toggle/ToggleMacroSettings.vue'

/**
 * Macro kinds: one per kind of live state an action can report, plus a plain
 * button for actions that report none.
 *
 * Each kind lives in `components/macro/<kind>/` as two components:
 *
 * - `<Kind>Macro` — how the macro is drawn on a screen, in the editor grid and
 *   on the remote. Takes {@link MacroDisplayProps}, emits {@link MacroDisplayEmits}.
 * - `<Kind>MacroSettings` — its panel on the right of the macro editor. Takes
 *   `v-model:look`, `v-model:state-appearance` and {@link MacroSettingsProps}.
 *   It is mounted fresh for each opening, so it reads both models once to set
 *   up its form; a kind with no live state sets `stateAppearance` to `undefined`.
 *
 * A macro's kind is saved on it as `Macro.stateKind`, since the remote has no
 * catalog to look it up in.
 */

/** The look a macro has on its own: one icon on a background. */
export interface MacroLook {
  icon: Icon
  iconColor: Color
  backgroundColor: Color
}

export interface MacroDisplayProps {
  macro: Macro
  mode: 'interact' | 'edit'
  /** The latest live reading for the macro's action. Remote only. */
  entry?: ActionStateEntry
  /** Whether to draw the macro's name. */
  showLabel: boolean
}

export type MacroDisplayEmits = {
  /** The user acted on the macro on the remote. `value` is for continuous controls such as a slider. */
  trigger: [value?: ActionStateValue]
}

export interface MacroSettingsProps {
  /** The action's live state for the chosen parameters. Absent for a plain button. */
  state?: ActionStateInfo
}

export type StateAppearance = Record<string, ActionAppearance>

interface MacroKind {
  display: Component
  settings: Component
}

const button: MacroKind = { display: ButtonMacro, settings: ButtonMacroSettings }

const kinds: Partial<Record<ActionStateKind, MacroKind>> = {
  toggle: { display: ToggleMacro, settings: ToggleMacroSettings },
}

/** The components for a kind of state; a plain button when there is none, or no components for it yet. */
export function useMacroKind(kind: ActionStateKind | undefined): MacroKind {
  return (kind && kinds[kind]) ?? button
}
