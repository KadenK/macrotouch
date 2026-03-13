import type { Color } from './common'

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

export class Macro {
  id: string
  name: string
  action: Action
  icon: Icon
  iconColor: Color
  backgroundColor: Color

  constructor(name: string, action: Action, icon: Icon, iconColor: Color, backgroundColor: Color, id?: string) {
    this.id = id || crypto.randomUUID()
    this.name = name
    this.action = action
    this.icon = icon
    this.iconColor = iconColor
    this.backgroundColor = backgroundColor
  }

  onTrigger(...args: any[]): void {
    if (this.action.validate(...args)) {
      this.action.execute(...args)
    } else {
      console.error('Invalid action parameters')
    }
  }
}
