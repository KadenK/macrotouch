import { DEFAULT_MASTER } from '../shared/websocket'
import { connectToMaster, nodeId } from './master-link'
import { StateMonitor } from './monitor'
import { run } from './runner'
import { PluginHost } from './plugin-host'

/**
 * The Action Server process.
 *
 * Connects to the master server, runs actions requested by it, and reports the
 * live state of the actions it is asked to watch.
 * `MACROTOUCH_MASTER_URL` points at a different master when needed.
 */

const url = process.env.MACROTOUCH_MASTER_URL || `ws://${DEFAULT_MASTER.host}:${DEFAULT_MASTER.wsPort}`
const host = new PluginHost()
await host.load()
const monitor = new StateMonitor(host, nodeId, (states) => link.sendState(states))
const link = connectToMaster(url, host, {
  onRun: (msg) =>
    void run(
      host,
      msg.actionId,
      msg.value === undefined ? msg.parameters : { ...msg.parameters, value: msg.value },
    ).then((outcome) => {
      link.sendResult({
        type: 'action-result',
        requestId: msg.requestId,
        ...outcome,
      })
      // Report the effect of a tap now rather than at the next poll.
      monitor.refresh(msg.actionId)
    }),
  onWatch: (msg) => monitor.setWatched(msg.actions),
})

host.onReload((id, before) => monitor.pluginReload(id, before))
host.onChange(() => link.resendHello())
const stop = () => {
  monitor.stop()
  link.close()
  void host.dispose()
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
process.once('disconnect', stop)
