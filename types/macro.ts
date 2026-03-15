/* eslint-disable @typescript-eslint/no-explicit-any */
// /types/macro.ts
import { Color } from './common'
import { generateUUID } from '../util/uuids'

export enum ActionType {
  Filepath = 'filepath',
  String = 'string',
  Enum = 'enum',
}

export interface ActionField {
  name: string
  type: ActionType
  options?: string[]
}

// Serializable action data (stored in localStorage)
export interface ActionData {
  name: string
  actionFields: ActionField[]
  type?: string // Identifies which concrete action to instantiate
  params?: Record<string, any>
}

// Abstract class for runtime actions (not stored)
export abstract class Action {
  name: string
  actionFields: ActionField[]
  constructor(name: string, actionFields: ActionField[]) {
    this.name = name
    this.actionFields = actionFields
  }
  abstract execute(...args: any[]): void
  abstract validate(...args: any[]): boolean
}

export enum IconSource {
  Library = 'LIBRARY',
  Filepath = 'FILEPATH',
}

export interface Icon {
  source: IconSource
  value: string
}

// Plain data object for a macro
export interface MacroData {
  id: string
  name: string
  action: ActionData // Now includes action data
  icon: Icon
  iconColor: Color
  backgroundColor: Color
}

// Factory for a no-op action (placeholder)
export function createNoOpActionData(): ActionData {
  return {
    name: 'No Action',
    actionFields: [],
    type: 'noop',
  }
}

// Factory function to create a new macro with defaults
export function createMacro(name = 'New Macro'): MacroData {
  return {
    id: generateUUID(),
    name,
    action: createNoOpActionData(),
    icon: { source: IconSource.Library, value: 'baseline:home' },
    iconColor: new Color(0, 0, 0),
    backgroundColor: new Color(255, 255, 255),
  }
}
