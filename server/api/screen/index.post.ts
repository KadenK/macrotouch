import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export default defineEventHandler(async (event) => {
  const screen = await readBody(event)
  if (!screen?.id) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid screen data' })
  }

  const filePath = resolve('data.json')
  let data: any = { macros: {}, screens: {} }
  try {
    const existing = await readFile(filePath, 'utf-8')
    data = JSON.parse(existing)
  } catch {}

  data.screens = data.screens || {}
  data.screens[screen.id] = screen

  await writeFile(filePath, JSON.stringify(data, null, 2))

  if (globalThis.broadcast) {
    globalThis.broadcast({ type: 'screen-updated', payload: screen })
  }
  return { success: true }
})
