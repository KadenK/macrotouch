import { defineComponent, h, markRaw, shallowRef } from 'vue'
import type { Component } from 'vue'
import { defaultFaceId, type FaceSetting, type InstalledPlugin } from '~/../shared/types/plugin'
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
import IconFace from '~/components/macro/faces/IconFace.vue'
import ValueFace from '~/components/macro/faces/ValueFace.vue'
import PluginElement from '~/components/macro/PluginElement.vue'

/**
 * Faces.
 *
 * A macro is a button on a screen with a chosen action and a configured face.
 * Its face is the visible part, drawn in its cell on the editor grid and on the
 * remote. The action decides which face (`ActionDescriptor.face`), defaulting to
 * the standard face for its live state ({@link defaultFaceId}); the editor saves
 * it on the macro (`Macro.face`), since the remote has no catalog.
 *
 * Each face lists the face settings it depends on, which the macro editor shows
 * on its right side in order; the macro holds their values (`components/macro/face-settings/`). Standard faces
 * live in `components/macro/faces/`; plugin faces are custom elements from the
 * plugin's `ui.mjs`.
 */

/** The face settings every macro has: one icon and two colors. */
export interface BaseFaceSettings {
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
  /** The user acted on the macro on the remote. `value` is for faces that set one, such as a plugin's dial. */
  trigger: [value?: ActionStateValue]
}

/** Icon and colors per live value, keyed by `String(value)`. Saved as `Macro.stateAppearance`. */
export type StateAppearance = Record<string, ActionAppearance>

/**
 * What every face setting component gets. Each one edits its part of the macro
 * through `v-model:base`, `v-model:state-appearance` or `v-model:face-settings`,
 * and is mounted fresh for each opening, action and state, so it may read them
 * once to set up its form.
 */
export interface FaceSettingProps {
  /** The action's live state for the chosen parameters. Absent when it reports none. */
  state?: ActionStateInfo
  /** The macro as edited so far. */
  macro: Macro
}

/** The value of the `text` face setting, used by the value face. */
export interface TextFaceSetting {
  size: 'auto' | 'small' | 'medium' | 'large'
  prefix: string
  suffix: string
}
export function textFaceSetting(macro: Pick<Macro, 'faceSettings'>): TextFaceSetting {
  const saved = (macro.faceSettings?.text ?? {}) as Partial<TextFaceSetting>
  return { size: saved.size ?? 'auto', prefix: saved.prefix ?? '', suffix: saved.suffix ?? '' }
}

export interface MacroFace {
  id: string
  label: string
  display: Component
  settings: FaceSetting[]
}

const standardFaces: MacroFace[] = [
  { id: 'core/icon', label: 'Icon', display: IconFace, settings: ['icon', 'colors', 'stateIcons'] },
  { id: 'core/value', label: 'Value', display: ValueFace, settings: ['colors', 'text'] },
]
const pluginFaces = shallowRef<MacroFace[]>([])

/** The face to draw a macro with: the one named, once loaded, otherwise the standard face for its live state. */
export function useMacroFace(faceId: string | undefined, kind?: ActionStateKind): MacroFace {
  return (
    [...standardFaces, ...pluginFaces.value].find((face) => face.id === faceId) ??
    standardFaces.find((face) => face.id === defaultFaceId(kind))!
  )
}

/**
 * The face settings the editor shows for a face. `stateIcons` only applies to
 * toggle actions, and then supplies the icons itself, so `icon` is dropped.
 */
export function faceSettingsFor(face: MacroFace, kind?: ActionStateKind): FaceSetting[] {
  const perState = kind === 'toggle' && face.settings.includes('stateIcons')
  return face.settings.filter((setting) =>
    setting === 'stateIcons' ? perState : setting === 'icon' ? !perState : true,
  )
}

/** The key a face setting's value is saved under in `Macro.faceSettings`. */
export function faceSettingId(setting: FaceSetting): string {
  return typeof setting === 'string' ? setting : setting.id
}

/** Register the faces of plugins whose `ui.mjs` has loaded. */
export function setPluginFaces(plugins: InstalledPlugin[]) {
  pluginFaces.value = plugins.flatMap((plugin) =>
    (plugin.faces ?? []).map((face) => ({
      id: `${plugin.id}/${face.id}`,
      label: face.label,
      settings: face.settings ?? ['colors'],
      // The plugin's custom element, given the same props as the standard faces.
      display: markRaw(
        defineComponent({
          props: ['macro', 'entry', 'mode', 'showLabel'],
          emits: ['trigger'],
          setup(props, { emit }) {
            return () =>
              h(PluginElement, {
                tag: face.element,
                properties: { ...props },
                onTrigger: (value: unknown) => emit('trigger', value as ActionStateValue | undefined),
              })
          },
        }),
      ),
    })),
  )
}
