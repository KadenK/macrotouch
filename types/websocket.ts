import type { MacroState } from './state'

export type BroadcastData = MacroState | { type: 'macro-trigger'; id: string }

export type WebSocketMessage =
  | { type: 'state'; state: MacroState }
  | { type: 'state-update'; state: MacroState }
  | { type: 'macro-trigger'; id: string }

export type WebSocketState = MacroState
