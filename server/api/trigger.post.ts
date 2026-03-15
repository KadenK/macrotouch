export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { id } = body

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Macro ID required' })
  }

  // Broadcast to WebSocket clients
  globalThis.broadcast?.({ type: 'macro-trigger', id })

  return { success: true, id }
})
