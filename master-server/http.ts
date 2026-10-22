import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'

/**
 * Serves the built web apps and this computer's IP addresses.
 *
 * Plain Node, no framework: the master runs as its own process.
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

export function startHttpServer(port: number, staticDir: string) {
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
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')

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
