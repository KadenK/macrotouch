export default defineEventHandler(async (event) => {
  const pathname = getRequestURL(event).pathname

  try {
    // Get client IP from various possible headers
    const forwarded = getHeader(event, 'x-forwarded-for')
    const realIp = getHeader(event, 'x-real-ip')
    const clientIP = (forwarded?.split(',')[0]?.trim() ||
      realIp ||
      event.node.req.socket?.remoteAddress ||
      '') as string

    // Check if client is Electron (localhost/127.0.0.1)
    const isElectron =
      clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === '::ffff:127.0.0.1' || clientIP === 'localhost'

    // Redirect / to /home for Electron, /screen for external devices
    if (pathname === '/') {
      const targetPath = isElectron ? '/home' : '/screen'
      return await sendRedirect(event, targetPath, 302)
    }

    // If NOT Electron and NOT accessing /screen, redirect to /screen
    if (!isElectron && pathname !== '/screen') {
      return await sendRedirect(event, '/screen', 302)
    }
  } catch (err) {
    console.error('[Access Control] Error:', err)
  }
})
