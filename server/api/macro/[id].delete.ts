import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing macro ID' })

  const filePath = resolve('data.json')
  let data: any = { macros: {}, screens: {} }
  try {
    const existing = await readFile(filePath, 'utf-8')
    data = JSON.parse(existing)
  } catch {}

  data.macros = data.macros || {}
  if (!data.macros[id]) {
    throw createError({ statusCode: 404, statusMessage: 'Macro not found' })
  }

  delete data.macros[id]
  await writeFile(filePath, JSON.stringify(data, null, 2))

  if (globalThis.broadcast) {
    globalThis.broadcast({ type: 'macro-deleted', payload: { id } })
  }
  return { success: true }
})
