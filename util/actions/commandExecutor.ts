import { getDefaultShell } from '../platform'

const isNode = typeof process !== 'undefined' && process.versions && process.versions.node

export async function executeCommand(command: string): Promise<void> {
  if (!isNode) {
    throw new Error('executeCommand is only available in a Node/Electron environment')
  }

  const { exec } = await import('node:child_process')
  const shell = getDefaultShell()

  return new Promise((resolve, reject) => {
    exec(command, { shell }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr })
        return
      }
      resolve()
    })
  })
}

export async function executeSpawn(command: string, args: string[] = []): Promise<void> {
  if (!isNode) {
    throw new Error('executeSpawn is only available in a Node/Electron environment')
  }

  const { spawn } = await import('node:child_process')

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: true })
    let stderr = ''

    child.on('error', (err) => reject({ err, stdout: '', stderr }))
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    child.on('close', (code) => {
      if (code !== 0) {
        reject({ code, stderr })
      } else {
        resolve()
      }
    })
  })
}
