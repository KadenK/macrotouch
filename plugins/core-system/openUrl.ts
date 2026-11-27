import { ActionType, defineAction, type Parameters, type PluginOS } from '../../plugin-sdk'
import { openUrlWithSystem } from './opener'

/** Only http and https allowed. */
function parseWebUrl(parameters: Parameters): string {
  const raw = typeof parameters?.url === 'string' ? parameters.url.trim() : ''
  if (!raw) throw new Error('Missing URL')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`Not a valid URL: ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https URLs can be opened')
  return url.href
}

const run = (platform: PluginOS) => (parameters: Parameters) => openUrlWithSystem(parseWebUrl(parameters), platform)

const action = defineAction({
  id: 'openUrl',
  label: 'Open URL',
  description: 'Open a web page in the default browser.',
  icon: 'ic:baseline-open-in-browser',
  actionFields: [
    {
      key: 'url',
      label: 'URL',
      type: ActionType.String,
    },
  ],
  impl: {
    linux: run('linux'),
    darwin: run('darwin'),
    win32: run('win32'),
  },
})

export default action
