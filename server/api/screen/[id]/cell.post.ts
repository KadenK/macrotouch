import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export default defineEventHandler(async (event) => {
  const screenId = event.context.params?.id
  if (!screenId) throw createError({ statusCode: 400, statusMessage: 'Missing screen ID' })

  const body = await readBody(event).catch(() => ({}))
  const { row, column, macroId } = body
  if (row === undefined || column === undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Missing row or column' })
  }

  const filePath = resolve('data.json')
  let data: any = { macros: {}, screens: {} }
  try {
    const existing = await readFile(filePath, 'utf-8')
    data = JSON.parse(existing)
  } catch {}

  data.screens = data.screens || {}
  const screen = data.screens[screenId]
  if (!screen) {
    throw createError({ statusCode: 404, statusMessage: 'Screen not found' })
  }

  screen.macroRows = screen.macroRows || []
  if (!screen.macroRows[row]) {
    screen.macroRows[row] = { macrosIds: [] }
  }

  screen.macroRows[row].macrosIds[column] = macroId || ''

  await writeFile(filePath, JSON.stringify(data, null, 2))

  if (globalThis.broadcast) {
    globalThis.broadcast({
      type: 'cell-updated',
      payload: { screenId, row, column, macroId: macroId || '' },
    })
  }
  return { success: true }
})
