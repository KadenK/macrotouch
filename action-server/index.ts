import { DEFAULT_MASTER } from '../shared/websocket'
import { connectToMaster } from './master-link'
import { run } from './runner'

/**
 * The Action Server process.
 *
 * Connects to the master server, then runs actions requested by it.
 * `MACROTOUCH_MASTER_URL` points at a different master when needed.
 */

const url = process.env.MACROTOUCH_MASTER_URL || `ws://${DEFAULT_MASTER.host}:${DEFAULT_MASTER.wsPort}`
const link = connectToMaster(url, (msg) => void run(msg.actionId, msg.parameters))

const stop = () => link.close()
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
process.once('disconnect', stop)
