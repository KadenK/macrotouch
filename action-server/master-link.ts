import { redactSecrets } from './redact'
import os from 'node:os'
import path from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import WebSocket from 'ws'
import { getPlatform } from '../shared/platform'
import {
  PROTOCOL_VERSION,
  type ActionStateMessage,
  type ActionResult,
  type NodeHello,
  type RunAction,
  type WatchActions,
} from '../shared/protocol'
import type { ActionStateEntry } from '../shared/types'
import { uuid } from '../shared/uuid'
import { toCatalog } from './catalog'
import type { PluginHost } from './plugin-host'
import { resolveDataRoot } from './data-root'
import type { ListOptions, PluginSecrets, PluginSync, TestPlugin } from '../shared/protocol/plugins'
import { errorText } from '../shared/errors'
import { withTimeout } from './timeout'

function getNodeId(): string {
  if (process.env.MACROTOUCH_NODE_ID) return process.env.MACROTOUCH_NODE_ID
  const root = resolveDataRoot()
  mkdirSync(root, { recursive: true })
  const file = path.join(root, 'node-id')
  try {
    writeFileSync(file, uuid(), { flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  return readFileSync(file, 'utf8').trim()
}
export const nodeId = getNodeId()

export type MasterLinkHandlers = {
  onRun: (msg: RunAction) => void
  onWatch: (msg: WatchActions) => void
}

export type MasterLink = {
  sendState: (states: ActionStateEntry[]) => void
  resendHello: () => void
  sendResult: (result: ActionResult) => void
  close: () => void
}

/** Connect this Action Server to the master, forward its requests, and report state back. */
export function connectToMaster(url: string, host: PluginHost, { onRun, onWatch }: MasterLinkHandlers): MasterLink {
  const socket = new WebSocket(url, { maxPayload: 64 * 1024 * 1024 })

  const resendHello = () => {
    void sendHello()
  }
  const sendHello = async () => {
    if (socket.readyState !== WebSocket.OPEN) return
    const hello: NodeHello = {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      role: 'node',
      nodeId,
      label: os.hostname(),
      platform: getPlatform(),
      catalog: toCatalog(host),
      plugins: await host.installed(),
      local: process.env.MACROTOUCH_LOCAL_NODE === '1',
    }
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(hello))
  }
  socket.on('open', resendHello)

  let queue = Promise.resolve()
  socket.on('message', (data) => {
    let message: unknown
    try {
      message = JSON.parse(data.toString())
    } catch (err) {
      console.error('Failed to parse master message', err)
      return
    }

    if (!message || typeof message !== 'object' || !('type' in message)) return
    if (message.type === 'run-action') onRun(message as RunAction)
    else if (message.type === 'watch-actions') onWatch(message as WatchActions)
    else if (message.type === 'plugin-sync' || message.type === 'plugin-secrets') {
      const received = message as PluginSync | PluginSecrets
      queue = queue
        .then(async () => {
          if (received.type === 'plugin-sync') await host.sync(received.plugins, received.disabled)
          else if (received.nodeId === nodeId || received.nodeId === 'all')
            await host.updateSecrets(received.pluginId, received.values)
        })
        .catch(() => console.warn('Plugin update failed'))
    } else if (message.type === 'test-plugin') {
      const request = message as TestPlugin
      void queue.then(async () => {
        const value = await host.test(request.pluginId)
        const result: ActionResult = {
          type: 'action-result',
          requestId: request.requestId,
          ok: true,
          value,
        }
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(result))
      })
    } else if (message.type === 'list-options') {
      const request = message as ListOptions
      void queue.then(async () => {
        const item = host.get(request.actionId)
        let result: ActionResult
        if (!item)
          result = {
            type: 'action-result',
            requestId: request.requestId,
            ok: false,
            error: { code: 'unknown-action', message: 'Unknown action' },
          }
        else
          try {
            const options = item.action.options?.[request.field]
            const value: unknown = options
              ? await withTimeout(() => options(request.parameters, item.ctx), 10000, 'Options timed out')
              : []
            if (
              !Array.isArray(value) ||
              !value.every(
                (v: unknown) =>
                  v !== null &&
                  typeof v === 'object' &&
                  typeof (v as { value?: unknown }).value === 'string' &&
                  ((v as { label?: unknown }).label === undefined ||
                    typeof (v as { label?: unknown }).label === 'string'),
              )
            )
              throw new Error('Invalid options')
            result = {
              type: 'action-result',
              requestId: request.requestId,
              ok: true,
              value,
            }
          } catch (error) {
            result = {
              type: 'action-result',
              requestId: request.requestId,
              ok: false,
              error: {
                code: 'plugin-error',
                message: redactSecrets(errorText(error), item.ctx.secrets),
              },
            }
          }
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(result))
      })
    }
  })

  let oversized = false
  socket.on('close', () => {
    if (oversized) return
    console.log('Master connection closed')
    process.exit(0)
  })

  socket.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH') {
      oversized = true
      console.error('Master sent a WebSocket frame exceeding the 64 MiB limit; connection closed')
      return
    }
    console.error('Master connection error', err)
    process.exit(0)
  })

  const sendState = (states: ActionStateEntry[]) => {
    if (socket.readyState !== WebSocket.OPEN) return
    const message: ActionStateMessage = { type: 'action-state', states }
    socket.send(JSON.stringify(message))
  }

  return {
    sendState,
    resendHello,
    sendResult: (result) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(result))
    },
    close: () => socket.close(),
  }
}
