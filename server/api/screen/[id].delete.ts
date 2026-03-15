import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing screen ID' })

  const filePath = resolve('data.json')
  let data: any = { macros: {}, screens: {} }
  try {
    const existing = await readFile(filePath, 'utf-8')
    data = JSON.parse(existing)
  } catch {}

  data.screens = data.screens || {}
  const screen = data.screens[id]
  if (!screen) {
    throw createError({ statusCode: 404, statusMessage: 'Screen not found' })
  }

  // Delete all macros associated with this screen
  if (screen.macroRows) {
    for (const row of screen.macroRows) {
      for (const macroId of row.macrosIds) {
        if (macroId && data.macros[macroId]) {
          delete data.macros[macroId]
          // Broadcast each macro deletion
          if (globalThis.broadcast) {
            globalThis.broadcast({ type: 'macro-deleted', payload: { id: macroId } })
          }
        }
      }
    }
  }

  // Delete the screen
  delete data.screens[id]
  await writeFile(filePath, JSON.stringify(data, null, 2))

  if (globalThis.broadcast) {
    globalThis.broadcast({ type: 'screen-deleted', payload: { id } })
  }

  return { success: true }
})
