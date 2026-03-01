// server/api/getIP.ts
import os from 'os'

export default defineEventHandler(() => {
  const interfaces = os.networkInterfaces()
  const addresses: { name: string; ip: string }[] = []

  // Collect all non‑internal IPv4 addresses
  for (const [name, netInterface] of Object.entries(interfaces)) {
    for (const config of netInterface || []) {
      if (config.family === 'IPv4' && !config.internal) {
        addresses.push({ name, ip: config.address })
      }
    }
  }

  // Define keywords to identify interface types
  const ethernetKeywords = ['ethernet', 'eth', 'enp', 'ens', 'eno']
  const wifiKeywords = ['wlan', 'wifi', 'wi-fi', 'wireless', 'wlp']

  // Helper to assign priority: 0 = Ethernet, 1 = Wi‑Fi, 2 = other
  const getPriority = (name: string): number => {
    const lower = name.toLowerCase()
    if (ethernetKeywords.some((keyword) => lower.includes(keyword))) return 0
    if (wifiKeywords.some((keyword) => lower.includes(keyword))) return 1
    return 2
  }

  // Sort addresses: Ethernet first, then Wi‑Fi, then others
  addresses.sort((a, b) => {
    const priorityA = getPriority(a.name)
    const priorityB = getPriority(b.name)
    return priorityA - priorityB
  })

  return addresses
})
