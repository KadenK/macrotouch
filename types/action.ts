export enum ActionType {
  Filepath = 'filepath',
  String = 'string',
  Enum = 'enum',
  ExecutablePath = 'executablePath',
}

export interface ActionField {
  key: string
  label: string
  type: ActionType
  options?: string[]
}

export interface Action {
  actionId: string
  label: string
  actionFields: ActionField[]
  execute(parameters: Record<string, unknown> | undefined): unknown | Promise<unknown>
}
