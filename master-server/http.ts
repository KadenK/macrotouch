import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import type { PluginRegistry } from './plugin-registry'
import { ImageError, bakedContentType, originalContentType, type MacroImages } from './macro-images'
import { BAKED_FILE_RE, IMAGE_ID_RE } from './image-ids'
import { IMAGE_LIMITS } from '../shared/types/macro'
import { isSafePluginPath } from '../shared/types/plugin'
import { isLoopback, type PairingToken } from './pairing'

/**
 * Serves the built web apps and this computer's IP addresses.
 *
 * Plain Node, no framework: the master runs as its own process.
 *
 * Pages are gated on the pairing token for requests from another device
 * (MAC-31). Before this, every route was served to everyone, so a phone that
 * typed `/home` or `/settings` by hand reached the editor (PA-08).
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

type Address = { name: string; ip: string }

const ETHERNET = ['ethernet', 'eth', 'enp', 'ens', 'eno']
const WIFI = ['wlan', 'wifi', 'wi-fi', 'wireless', 'wlp']

/** Non-internal IPv4 addresses, Ethernet first, then Wi-Fi, then the rest. */
export function listAddresses(): Address[] {
  const addresses: Address[] = []
  for (const [name, netInterface] of Object.entries(os.networkInterfaces())) {
    for (const config of netInterface || []) {
      if (config.family === 'IPv4' && !config.internal) addresses.push({ name, ip: config.address })
    }
  }

  const priority = (name: string): number => {
    const lower = name.toLowerCase()
    if (ETHERNET.some((keyword) => lower.includes(keyword))) return 0
    if (WIFI.some((keyword) => lower.includes(keyword))) return 1
    return 2
  }
  return addresses.sort((a, b) => priority(a.name) - priority(b.name))
}

/**
 * Pages, as opposed to the assets they pull in.
 *
 * Only these are gated. Scripts, styles and images stay open: the token lives
 * in the page URL, every asset request a browser makes off that page would have
 * to carry it, and an asset reveals nothing a client could not get by reading
 * the app bundle it is already allowed to download.
 */
const isPageRequest = (pathname: string) => {
  const ext = path.extname(pathname).toLowerCase()
  return ext === '' || ext === '.html'
}

const DENIED_PAGE = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not paired</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; display: grid; place-items: center;
         min-height: 100vh; padding: 24px; text-align: center; color: #1a1a1a; background: #fafafa; }
  h1 { font-size: 1.25rem; margin: 0 0 8px; }
  p { margin: 0; color: #555; max-width: 32ch; }
</style>
<h1>This device is not paired</h1>
<p>Open the Connect page on the host computer and scan the QR code again.</p>
`

/** A browser page on this computer (the dev UI runs on another port) or no page at all (curl, Electron). */
const isLocalOrigin = (origin: string | undefined) => {
  if (!origin) return true
  try {
    const host = new URL(origin).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  } catch {
    return false
  }
}

const IMAGE_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-pairing-token',
  'Access-Control-Max-Age': '600',
}

/** Headers that stop an image from ever being treated as a page, whatever it contains. */
const IMAGE_SAFETY = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

const sendJson = (res: http.ServerResponse, status: number, body: unknown, headers: http.OutgoingHttpHeaders = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...IMAGE_CORS, ...headers })
  res.end(JSON.stringify(body))
}

/** The body, or null once it passes `limit` (the request is then answered and cut off). */
const readBody = (req: http.IncomingMessage, res: http.ServerResponse, limit: number) =>
  new Promise<Buffer | null>((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let done = false
    const tooLarge = () => {
      if (done) return
      done = true
      sendJson(res, 413, { error: 'Request body is too large' }, { Connection: 'close' })
      res.once('finish', () => req.destroy())
      resolve(null)
    }
    if (Number(req.headers['content-length']) > limit) return tooLarge()
    req.on('data', (chunk: Buffer) => {
      if (done) return
      size += chunk.length
      if (size > limit) {
        chunks.length = 0
        return tooLarge()
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!done) {
        done = true
        resolve(Buffer.concat(chunks))
      }
    })
    req.on('error', () => {
      if (!done) {
        done = true
        resolve(null)
      }
    })
  })

export function startHttpServer(
  port: number,
  staticDir: string,
  pairing: PairingToken,
  plugins: PluginRegistry,
  images: MacroImages,
) {
  const root = path.resolve(staticDir)

  const sendFile = (res: http.ServerResponse, filePath: string, headOnly: boolean) => {
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
    if (headOnly) {
      res.end()
      return
    }
    fs.createReadStream(filePath).pipe(res)
  }

  const sendImage = (res: http.ServerResponse, file: string, contentType: string, cache: string, headOnly: boolean) => {
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, IMAGE_CORS).end()
        return
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Cache-Control': cache,
        ...IMAGE_CORS,
        ...IMAGE_SAFETY,
      })
      if (headOnly) res.end()
      else fs.createReadStream(file).pipe(res)
    })
  }

  const handleImageRequest = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
    isEditor: () => boolean,
  ) => {
    const method = req.method ?? 'GET'
    try {
      if (method === 'OPTIONS') {
        res.writeHead(204, IMAGE_CORS).end()
        return
      }

      if (method === 'POST') {
        const bake = /^\/api\/macro-image\/([^/]+)\/bake$/.exec(pathname)
        if (pathname !== '/api/macro-image' && !bake) {
          res.writeHead(404, IMAGE_CORS).end()
          return
        }
        if (!isEditor()) {
          console.warn(`[Images] refused ${pathname} from ${req.socket.remoteAddress ?? 'unknown'}`)
          sendJson(res, 401, { error: 'Pairing token required' })
          return
        }
        if (bake) {
          if (!IMAGE_ID_RE.test(bake[1]!)) {
            sendJson(res, 404, { error: 'No such image' })
            return
          }
          const body = await readBody(req, res, 4096)
          if (!body) return
          let options: { span?: unknown; crop?: unknown }
          try {
            options = JSON.parse(body.toString('utf8'))
          } catch {
            sendJson(res, 400, { error: 'Body must be JSON' })
            return
          }
          sendJson(res, 200, await images.bake(bake[1]!, { span: options?.span, crop: options?.crop }))
          return
        }
        const body = await readBody(req, res, IMAGE_LIMITS.maxBytes)
        if (!body) return
        sendJson(res, 200, await images.ingest(body, req.headers['content-type']))
        return
      }

      if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, IMAGE_CORS).end()
        return
      }
      const headOnly = method === 'HEAD'

      // Matched on the raw path: no decoding, so nothing like `..%2f` ever reaches the file system.
      const baked = pathname.startsWith('/macro-images/baked/') && BAKED_FILE_RE.exec(pathname.slice(20))
      if (baked) {
        const [, id, rev, ext] = baked
        sendImage(
          res,
          images.bakedFile(id!, rev!, ext!),
          bakedContentType(ext!),
          'public, max-age=31536000, immutable',
          headOnly,
        )
        return
      }

      const original = pathname.startsWith('/macro-images/originals/') && pathname.slice(24)
      if (original && IMAGE_ID_RE.test(original)) {
        if (!isEditor()) {
          console.warn(`[Images] refused ${pathname} from ${req.socket.remoteAddress ?? 'unknown'}`)
          res.writeHead(401, IMAGE_CORS).end()
          return
        }
        const found = images.findOriginal(original)
        if (!found) {
          res.writeHead(404, IMAGE_CORS).end()
          return
        }
        sendImage(res, found.file, originalContentType(found.ext), 'private, max-age=60', headOnly)
        return
      }

      res.writeHead(404, IMAGE_CORS).end()
    } catch (err) {
      if (res.headersSent) return
      if (err instanceof ImageError) sendJson(res, err.status, { error: err.message })
      else {
        console.error('[Images] request failed:', err)
        sendJson(res, 500, { error: 'Internal error' })
      }
    }
  }

  const server = http.createServer((req, res) => {
    const { pathname, searchParams } = new URL(req.url ?? '/', 'http://localhost')

    if (pathname === '/api/ip') {
      // Open to any origin so a web app served from elsewhere can ask a remote master.
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(listAddresses()))
      return
    }

    // The real socket address, not a header. `x-forwarded-for` is supplied by
    // the client and can say anything.
    const local = isLoopback(req.socket.remoteAddress)

    // Custom macro images. Handled before everything else: the page gate below
    // would treat the extensionless original URLs as pages.
    if (pathname.startsWith('/api/macro-image') || pathname.startsWith('/macro-images/')) {
      // An editor is on this computer (and, if a web page, one served from here) or holds the token.
      const isEditor = () => {
        const token = req.headers['x-pairing-token']
        return (
          (local && isLocalOrigin(req.headers.origin)) ||
          pairing.verify(searchParams.get('token')) ||
          pairing.verify(Array.isArray(token) ? token[0] : token)
        )
      }
      void handleImageRequest(req, res, pathname, isEditor)
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end()
      return
    }

    if (pathname.startsWith('/plugins/')) {
      try {
        const parts = decodeURIComponent(pathname).split('/')
        const id = parts[2] ?? ''
        const sha = parts[3] ?? ''
        const relPath = parts.slice(4).join('/')
        const files = isSafePluginPath(relPath) ? plugins.get(id, sha) : undefined
        if (!files || !Object.hasOwn(files, relPath)) {
          res.writeHead(404).end()
          return
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(relPath).toLowerCase()] ?? 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
          // Lets an app served from another port (`npm run dev`) import plugin UI modules.
          'Access-Control-Allow-Origin': '*',
        })
        res.end(req.method === 'HEAD' ? undefined : Buffer.from(files[relPath]!, 'base64'))
      } catch {
        res.writeHead(404).end()
      }
      return
    }

    if (!local && isPageRequest(pathname)) {
      if (!pairing.verify(searchParams.get('token'))) {
        console.warn(`[Pairing] refused ${pathname} from ${req.socket.remoteAddress ?? 'unknown'}`)
        res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(req.method === 'HEAD' ? undefined : DENIED_PAGE)
        return
      }
    }

    let decoded: string
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      res.writeHead(400).end()
      return
    }

    const headOnly = req.method === 'HEAD'
    const candidate = path.join(root, path.normalize(decoded))
    if (candidate !== root && !candidate.startsWith(root + path.sep)) {
      res.writeHead(403).end()
      return
    }

    fs.stat(candidate, (err, stat) => {
      if (!err && stat.isFile()) {
        sendFile(res, candidate, headOnly)
        return
      }
      // Client-side routes (/home, /screen, ...) all load the app shell.
      const index = path.join(root, 'index.html')
      if (!path.extname(decoded) && fs.existsSync(index)) {
        sendFile(res, index, headOnly)
        return
      }
      res.writeHead(404).end()
    })
  })

  server.listen(port, '0.0.0.0', () => {
    console.log(`HTTP server started on port ${port}, serving ${root}`)
  })

  return server
}
