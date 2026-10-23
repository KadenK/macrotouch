import { actions } from './action-map'

/** Run one registered action without letting failures escape the runner. */
export async function run(actionId: string, parameters?: Record<string, unknown>): Promise<void> {
  try {
    const action = actions[actionId]
    if (!action) {
      console.warn(`No action found for actionId: ${actionId}`)
      return
    }

    await action.execute(parameters)
  } catch (err) {
    console.error('Failed to execute macro action', err)
  }
}
