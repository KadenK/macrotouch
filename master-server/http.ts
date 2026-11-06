import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
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

export function startHttpServer(port: number, staticDir: string, pairing: PairingToken) {
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

  const server = http.createServer((req, res) => {
    const { pathname, searchParams } = new URL(req.url ?? '/', 'http://localhost')

    if (pathname === '/api/ip') {
      // Open to any origin so a web app served from elsewhere can ask a remote master.
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(listAddresses()))
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end()
      return
    }

    // The real socket address, not a header. `x-forwarded-for` is supplied by
    // the client and can say anything.
    const local = isLoopback(req.socket.remoteAddress)
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
