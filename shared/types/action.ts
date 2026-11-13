import type { ActionStateValue } from './actionState'

export enum ActionType {
  Filepath = 'filepath',
  String = 'string',
  Enum = 'enum',
  ExecutablePath = 'executablePath',
  KeyCombo = 'keyCombo',
}

export interface ActionField {
  key: string
  label: string
  type: ActionType
  options?: string[]
}

/**
 * The shape of a live reading, which decides the widget a controller draws.
 *
 * - `toggle`: a boolean, drawn as a button whose look follows the value.
 * - `range`: a number from 0 to 1, drawn as a slider.
 * - `text`: a string, drawn as a button that can show it.
 */
export type ActionStateKind = 'toggle' | 'range' | 'text'

/** The part of {@link ActionStateSpec} that is data, so it can travel in a catalog. */
export interface ActionStateInfo {
  kind: ActionStateKind
  /**
   * The parameter values this state applies to, e.g. `{ control: 'Mute' }`.
   * Left out, it applies whatever the parameters.
   */
  when?: Record<string, string>
  /** Names for each value, shown in the editor, e.g. `{ true: 'Muted', false: 'Unmuted' }`. */
  valueLabels?: Record<string, string>
  /** Icons a new macro starts with for each value, e.g. `{ true: 'ic:baseline-volume-off' }`. */
  defaultIcons?: Record<string, string>
}

/** Present on an action that can report what the computer is currently doing. */
export interface ActionStateSpec extends ActionStateInfo {
  /** Read the current value. `null` means it could not be read. */
  get(parameters: Record<string, unknown> | undefined): ActionStateValue | Promise<ActionStateValue>
}

export interface Action {
  actionId: string
  label: string
  actionFields: ActionField[]
  execute(parameters: Record<string, unknown> | undefined): unknown | Promise<unknown>
  /**
   * What this action can report live, per parameter choice. The first entry
   * whose `when` matches the macro's parameters applies; none matching means
   * the macro is not stateful.
   */
  states?: ActionStateSpec[]
}

/** The state that applies to an action run with `parameters`, if any. */
export function findActionState<T extends ActionStateInfo>(
  states: T[] | undefined,
  parameters: Record<string, unknown> | undefined,
): T | undefined {
  return states?.find((state) =>
    Object.entries(state.when ?? {}).every(([key, value]) => String(parameters?.[key] ?? '') === value),
  )
}
