import fs from 'fs'
import os from 'os'
import path from 'path'
import type { MacroState } from '../shared/types'
import { createDefaultSettings } from '../shared/types'

/**
 * Reads and writes the state file.
 *
 * Split out of the websocket plugin in MAC-40. MAC-39 moves this folder out of
 * Nitro; keep it free of Nitro and Nuxt imports so that move stays a rename.
 */

export function resolveDataRoot(): string {
  return process.env.MACROTOUCH_DATA_DIR || process.env.XDG_DATA_HOME || path.join(os.homedir(), '.macroTouch')
}

export function emptyState(): MacroState {
  // Settings are seeded here so a fresh state file still carries them (ST-02).
  // Before MAC-40 the client supplied them implicitly by sending whole state.
  return { macros: {}, screens: {}, settings: createDefaultSettings() }
}

export class StateFile {
  readonly dataRoot: string
  readonly filePath: string

  constructor(dataRoot = resolveDataRoot()) {
    this.dataRoot = dataRoot
    this.filePath = path.join(dataRoot, 'state.json')
    try {
      fs.mkdirSync(dataRoot, { recursive: true })
    } catch (err) {
      console.error('[WebSocket] cannot create data directory', dataRoot, err)
    }
  }

  /**
   * A missing file is a fresh start. A corrupt one is logged and also starts
   * empty — it is deliberately not backed up, and the next save overwrites it
   * (ST-05).
   */
  load(): MacroState {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(data) as MacroState
      console.log('Loaded state from file')
      return parsed
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Error reading state file:', err)
      }
      return emptyState()
    }
  }

  /** Non-blocking (ST-08). A write failure is logged and nothing else (ST-06). */
  save(state: MacroState): void {
    let data: string
    try {
      data = JSON.stringify(state, null, 2)
    } catch (err) {
      console.error('Failed to stringify state:', err)
      return
    }

    fs.writeFile(this.filePath, data, 'utf-8', (err) => {
      if (err) console.error('Failed to save state:', err)
    })
  }
}
