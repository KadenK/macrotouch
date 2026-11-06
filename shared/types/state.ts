import type { Color } from './common'
import type { Macro } from './macro'
import type { MacroScreen } from './screen'

export interface MacroSettings {
  defaultScreenBgColor: Color
  defaultScreenSize: { rows: number; columns: number }
  /** Default macro colors given to every newly created screen. */
  defaultMacroIconColor: Color
  defaultMacroBackgroundColor: Color
  swipeToChangeScreens: boolean
  hideBlankButtons: boolean
  attemptFullscreen: boolean
  /** Show macro names under the buttons in the editor. */
  showEditorLabels: boolean
  /** Show macro names under the buttons on the remote. */
  showRemoteLabels: boolean
}

export function createDefaultSettings(): MacroSettings {
  return {
    defaultScreenBgColor: { r: 240, g: 240, b: 240 },
    defaultScreenSize: { rows: 3, columns: 5 },
    defaultMacroIconColor: { r: 0, g: 0, b: 0 },
    defaultMacroBackgroundColor: { r: 255, g: 255, b: 255 },
    swipeToChangeScreens: true,
    hideBlankButtons: true,
    attemptFullscreen: true,
    showEditorLabels: false,
    showRemoteLabels: false,
  }
}

export interface MacroState {
  macros: Record<string, Macro>
  screens: Record<string, MacroScreen>
  settings?: MacroSettings
}
