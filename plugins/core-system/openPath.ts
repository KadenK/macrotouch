import { existsSync } from 'node:fs'
import { ActionType, defineAction, type Parameters, type PluginOS } from '../../plugin-sdk'
import { openWithSystem } from './opener'

function parsePath(parameters: Parameters): string {
  const target = typeof parameters?.path === 'string' ? parameters.path.trim() : ''
  if (!target) throw new Error('Missing file or folder')
  if (!existsSync(target)) throw new Error(`No such file or folder: ${target}`)
  return target
}

const run = (platform: PluginOS) => (parameters: Parameters) => openWithSystem(parsePath(parameters), platform)

const action = defineAction({
  id: 'openPath',
  label: 'Open File or Folder',
  description: 'Open a file in its default app, or a folder in the file manager.',
  icon: 'ic:baseline-folder-open',
  actionFields: [
    {
      key: 'path',
      label: 'File or folder',
      type: ActionType.Filepath,
    },
  ],
  impl: {
    linux: run('linux'),
    darwin: run('darwin'),
    win32: run('win32'),
  },
})

export default action
