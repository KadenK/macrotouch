import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export default defineEventHandler(async () => {
  const filePath = resolve('data.json')
  console.log('state.get: reading from', filePath)
  try {
    const data = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(data)
    console.log('state.get: found screens:', Object.keys(parsed.screens || {}).length)
    return {
      macros: parsed.macros || {},
      screens: parsed.screens || {},
    }
  } catch (err) {
    console.log('state.get: error or no file', err)
    return { macros: {}, screens: {} }
  }
})