import { spawn } from 'node:child_process'
import { ActionType, defineAction, type Parameters } from '../../plugin-sdk'

const isUrl = (value: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(value)

const action = defineAction({
  id: 'launchApp',
  label: 'Launch App',
  description: 'Open an application.',
  icon: 'ic:baseline-launch',
  actionFields: [
    {
      key: 'app',
      label: 'App',
      type: ActionType.ExecutablePath,
    },
    {
      key: 'args',
      label: 'Arguments',
      type: ActionType.String,
    },
  ],
  impl: {
    linux: (parameters) => launch(parameters, 'linux'),
    darwin: (parameters) => launch(parameters, 'darwin'),
    win32: (parameters) => launch(parameters, 'win32'),
  },
})

async function launch(parameters: Parameters, platform: 'linux' | 'darwin' | 'win32') {
  const target = parameters?.app
  const args = typeof parameters?.args === 'string' ? parameters.args : ''
  if (!target || typeof target !== 'string') throw new Error('Missing or invalid app parameter')
  let command: string
  if (platform === 'win32') command = `start "" "${target}" ${args}`
  else if (isUrl(target)) command = `${platform === 'darwin' ? 'open' : 'xdg-open'} "${target}" ${args}`
  else if (platform === 'darwin' && target.endsWith('.app')) command = `open -a "${target}" ${args}`
  else command = `${target} ${args}`
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.trim(), { shell: true, detached: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

export default action
