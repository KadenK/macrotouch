import { DEFAULT_MASTER } from '../shared/websocket'
import { connectToMaster, nodeId } from './master-link'
import { StateMonitor } from './monitor'
import { run } from './runner'

/**
 * The Action Server process.
 *
 * Connects to the master server, runs actions requested by it, and reports the
 * live state of the actions it is asked to watch.
 * `MACROTOUCH_MASTER_URL` points at a different master when needed.
 */

const url = process.env.MACROTOUCH_MASTER_URL || `ws://${DEFAULT_MASTER.host}:${DEFAULT_MASTER.wsPort}`
const monitor = new StateMonitor(nodeId, (states) => link.sendState(states))
const link = connectToMaster(url, {
  onRun: (msg) =>
    void run(msg.actionId, msg.parameters).then(() => {
      // Report the effect of a tap now rather than at the next poll.
      monitor.refresh(msg.actionId)
    }),
  onWatch: (msg) => monitor.setWatched(msg.actions),
})

const stop = () => {
  monitor.stop()
  link.close()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
process.once('disconnect', stop)
