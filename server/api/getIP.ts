// server/api/getIP.ts
import os from 'os'

export default defineEventHandler(() => {
  const interfaces = os.networkInterfaces()
  const addresses: { name: string; ip: string }[] = []

  for (const [name, netInterface] of Object.entries(interfaces)) {
    for (const config of netInterface || []) {
      // IPv4 only, skip internal loopback
      if (config.family === 'IPv4' && !config.internal) {
        addresses.push({
          name: name,
          ip: config.address,
        })
      }
    }
  }
  return addresses // This must return an array
})
