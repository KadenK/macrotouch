import type { ProtocolError } from '../shared/protocol'
import type { PluginHost } from './plugin-host'
import { redactSecrets } from './redact'
import { createRunContext } from './plugin-context'
import { errorText } from '../shared/errors'
import { withTimeout } from './timeout'

export type RunOutcome = { ok: true; value?: unknown } | { ok: false; error: ProtocolError }
export async function run(
  host: PluginHost,
  actionId: string,
  parameters?: Record<string, unknown>,
): Promise<RunOutcome> {
  const item = host.get(actionId)
  if (!item)
    return {
      ok: false,
      error: { code: 'unknown-action', message: `Unknown action: ${actionId}` },
    }
  const promise = runPinned()
  host.trackRun(item.plugin, promise)
  return promise
  async function runPinned(): Promise<RunOutcome> {
    try {
      if (!item)
        return {
          ok: false,
          error: {
            code: 'unknown-action',
            message: `Unknown action: ${actionId}`,
          },
        }
      let availability = item.availability
      if (availability.status === 'unsupported-platform')
        return {
          ok: false,
          error: {
            code: 'unsupported-platform',
            message: availability.message ?? 'Unsupported platform',
            details: availability,
          },
        }
      if (!['available', 'not-ready', 'not-configured'].includes(availability.status))
        return {
          ok: false,
          error: {
            code: 'action-unavailable',
            message: availability.message ?? 'Action unavailable',
            details: availability,
          },
        }
      availability = await host.checkReady(actionId, item)
      if (availability.status !== 'available')
        return {
          ok: false,
          error: {
            code: 'action-unavailable',
            message: availability.message ?? 'Action unavailable',
            details: availability,
          },
        }
      const handler = item.action.impl?.[item.ctx.platform as 'linux' | 'darwin' | 'win32'] ?? item.action.execute
      if (!handler) throw new Error('Action has no handler')
      const controller = new AbortController()
      const value = await withTimeout(
        () => handler(parameters, createRunContext(item.ctx, controller.signal)),
        30000,
        'Action timed out',
        () => controller.abort(),
      )
      return { ok: true, ...(value === undefined ? {} : { value }) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') host.markStale()
      return {
        ok: false,
        error: {
          code: 'plugin-error',
          message: redactSecrets(errorText(error), item!.ctx.secrets),
        },
      }
    }
  }
}
