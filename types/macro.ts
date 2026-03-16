import type { Color } from './common'
import { createColor } from './common'

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

export interface Macro {
  id: string
  name: string
  action: any
  icon: Icon
  iconColor: Color
  backgroundColor: Color
}

export function createMacro(name = 'New Macro'): Macro {
  return {
    id: crypto.randomUUID(),
    name,
    action: { name: 'No Action', actionFields: [], type: 'noop' },
    icon: { source: IconSource.Library, value: 'baseline:home' },
    iconColor: createColor(0, 0, 0),
    backgroundColor: createColor(255, 255, 255),
  }
}
