import os from 'node:os'
import path from 'node:path'

export function resolveDataRoot(): string {
  return process.env.MACROTOUCH_DATA_DIR || process.env.XDG_DATA_HOME || path.join(os.homedir(), '.macroTouch')
}
