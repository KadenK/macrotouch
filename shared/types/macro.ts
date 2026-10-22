import type { Color } from './common'
import { createColor } from './common'

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
  actionId?: string
  icon: Icon
  iconColor: Color
  backgroundColor: Color
  parameters?: Record<string, any>
}

export function createMacro(name = 'New Macro'): Macro {
  return {
    id: crypto.randomUUID(),
    name,
    actionId: undefined,
    icon: { source: IconSource.Library, value: 'ic:baseline-home' },
    iconColor: createColor(0, 0, 0),
    backgroundColor: createColor(255, 255, 255),
  }
}
