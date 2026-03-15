import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export default defineEventHandler(async (event) => {
  const macro = await readBody(event)
  if (!macro?.id) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid macro data' })
  }

  const filePath = resolve('data.json')
  let data: any = { macros: {}, screens: {} }
  try {
    const existing = await readFile(filePath, 'utf-8')
    data = JSON.parse(existing)
  } catch {}

  data.macros = data.macros || {}
  data.macros[macro.id] = macro

  await writeFile(filePath, JSON.stringify(data, null, 2))

  if (globalThis.broadcast) {
    globalThis.broadcast({ type: 'macro-updated', payload: macro })
  }
  return { success: true }
})
