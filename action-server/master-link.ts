import os from 'node:os'
import WebSocket from 'ws'
import { getPlatform } from '../shared/platform'
import { PROTOCOL_VERSION, type NodeHello, type RunAction } from '../shared/protocol'
import { uuid } from '../shared/uuid'
import { toCatalog } from './catalog'

const nodeId = uuid()

/** Connect this Action Server to the master and forward action requests. */
export function connectToMaster(url: string, onRun: (msg: RunAction) => void): { close: () => void } {
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

    if (message && typeof message === 'object' && 'type' in message && message.type === 'run-action') {
      onRun(message as RunAction)
    }
  })

  socket.on('close', () => {
    console.log('Master connection closed')
    process.exit(0)
  })

  socket.on('error', (err) => {
    console.error('Master connection error', err)
    process.exit(0)
  })

  return { close: () => socket.close() }
}
