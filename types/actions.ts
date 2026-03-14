import type { Action } from './macro'

export function createNoOpAction(): Action {
  return {
    name: 'No Action',
    actionFields: [],
  }
}
