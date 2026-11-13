import os from 'node:os'
import WebSocket from 'ws'
import { getPlatform } from '../shared/platform'
import {
  PROTOCOL_VERSION,
  type ActionStateMessage,
  type NodeHello,
  type RunAction,
  type WatchActions,
} from '../shared/protocol'
import type { ActionStateEntry } from '../shared/types'
import { uuid } from '../shared/uuid'
import { toCatalog } from './catalog'

export const nodeId = uuid()

export type MasterLinkHandlers = {
  onRun: (msg: RunAction) => void
  onWatch: (msg: WatchActions) => void
}

export type MasterLink = {
  sendState: (states: ActionStateEntry[]) => void
  close: () => void
}

/** Connect this Action Server to the master, forward its requests, and report state back. */
export function connectToMaster(url: string, { onRun, onWatch }: MasterLinkHandlers): MasterLink {
  const socket = new WebSocket(url)

  socket.on('open', () => {
    const hello: NodeHello = {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      role: 'node',
      nodeId,
      label: os.hostname(),
      platform: getPlatform(),
      catalog: toCatalog(),
    }
    socket.send(JSON.stringify(hello))
  })

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
  })

  socket.on('close', () => {
    console.log('Master connection closed')
    process.exit(0)
  })

  socket.on('error', (err) => {
    console.error('Master connection error', err)
    process.exit(0)
  })

  const sendState = (states: ActionStateEntry[]) => {
    if (socket.readyState !== WebSocket.OPEN) return
    const message: ActionStateMessage = { type: 'action-state', states }
    socket.send(JSON.stringify(message))
  }

  return { sendState, close: () => socket.close() }
}
