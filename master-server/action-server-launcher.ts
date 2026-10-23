import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const MIN_DELAY_MS = 1000
const MAX_DELAY_MS = 10000
/** A child that stayed up this long counts as healthy, so the next failure starts the backoff over. */
const STABLE_MS = 30000

/** Keeps the local action server running: restarts it on any exit that stop() did not ask for. */
export function createActionServerLauncher({ masterUrl }: { masterUrl: string }) {
  let child: ChildProcess | undefined
  let restartTimer: NodeJS.Timeout | undefined
  let stopping = false
  let delay = MIN_DELAY_MS

  const scheduleRestart = (startedAt: number) => {
    if (stopping || restartTimer) return
    delay = Date.now() - startedAt >= STABLE_MS ? MIN_DELAY_MS : Math.min(delay * 2, MAX_DELAY_MS)
    console.log(`[action-server] restarting in ${delay / 1000}s`)
    restartTimer = setTimeout(() => {
      restartTimer = undefined
      spawnChild()
    }, delay)
  }

  const spawnChild = () => {
    const bundle = fileURLToPath(new URL('../dist-action/index.mjs', import.meta.url))
    const entry = existsSync(bundle) ? bundle : fileURLToPath(new URL('../action-server/index.ts', import.meta.url))
    const args = entry === bundle ? [entry] : ['--import', 'tsx', entry]
    const startedAt = Date.now()
    const processChild = spawn(process.execPath, args, {
      env: { ...process.env, MACROTOUCH_MASTER_URL: masterUrl },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    child = processChild

    for (const stream of [processChild.stdout, processChild.stderr]) {
      if (!stream) continue
      createInterface({ input: stream }).on('line', (line) => console.log(`[action-server] ${line}`))
    }
    processChild.on('error', (error) => {
      console.error('[action-server] process error:', error)
      // A failed spawn never emits 'exit'.
      if (child === processChild && processChild.pid === undefined) {
        child = undefined
        scheduleRestart(startedAt)
      }
    })
    processChild.on('exit', (code, signal) => {
      console.log(`[action-server] exited (${signal ?? code})`)
      if (child !== processChild) return
      child = undefined
      scheduleRestart(startedAt)
    })
  }

  return {
    start(): void {
      if (child || restartTimer) return
      stopping = false
      delay = MIN_DELAY_MS / 2 // first failure retries after MIN_DELAY_MS
      spawnChild()
    },

    async stop(): Promise<void> {
      stopping = true
      clearTimeout(restartTimer)
      restartTimer = undefined
      const processChild = child
      if (!processChild) return
      child = undefined
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => processChild.kill('SIGKILL'), 2000)
        processChild.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
        processChild.kill('SIGTERM')
      })
    },
  }
}
