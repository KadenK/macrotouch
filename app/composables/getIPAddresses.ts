import { ref, reactive, onMounted } from 'vue'
import QRCode from 'qrcode'

type NetworkInterface = {
  name: string
  ip: string
  url: string
}

export const useNetwork = () => {
  console.log('📱 useNetwork() called - using ONLY WebRTC, no server fetches, no dummy data')

  const networkInterfaces = ref<NetworkInterface[]>([])
  const qrCodes = reactive<Record<string, string>>({})
  const loading = ref(true)
  const error = ref<string | null>(null)

  // Generate QR code
  const generateQRCode = async (url: string): Promise<string> => {
    return await QRCode.toDataURL(url, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
  }

  // Get local IPs using ONLY WebRTC - NO FALLBACKS
  const getLocalIPs = (): Promise<string[]> => {
    console.log('🔍 WebRTC: Attempting to get local IPs...')

    return new Promise((resolve) => {
      try {
        const ips: string[] = []
        const pc = new RTCPeerConnection({ iceServers: [] })

        pc.createDataChannel('')
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .catch((err) => console.log('WebRTC offer error:', err))

        pc.onicecandidate = (event) => {
          if (!event.candidate) {
            // No more candidates - resolve with what we found (could be empty)
            console.log('WebRTC: Gathering complete, found IPs:', ips)
            resolve(ips) // NO FALLBACK - return empty array if none found
            return
          }

          const candidate = event.candidate.candidate
          const ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/
          const match = candidate.match(ipRegex)

          if (match && match[1]) {
            const ip = match[1]
            // Only include private IP ranges
            if (ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) {
              if (!ips.includes(ip)) {
                ips.push(ip)
                console.log('WebRTC: Found real IP:', ip)
              }
            }
          }
        }

        setTimeout(() => {
          console.log('WebRTC: Timeout, found IPs:', ips)
          resolve(ips) // NO FALLBACK - just return what we found
        }, 3000)
      } catch (err) {
        console.log('WebRTC failed:', err)
        resolve([]) // NO FALLBACK - return empty array
      }
    })
  }

  const fetchNetworkIPs = async () => {
    console.log('🌐 fetchNetworkIPs: Starting (NO server calls, NO dummy data)')
    loading.value = true
    error.value = null

    try {
      const currentPort = window.location.port || '80'
      const protocol = window.location.protocol

      const ips = await getLocalIPs()
      console.log('📋 Real IPs found:', ips)

      if (ips.length === 0) {
        console.log('⚠️ No real IPs found')
        networkInterfaces.value = []
        error.value = 'No local network interfaces detected. Make sure you are connected to a network.'
        return
      }

      const interfaces: NetworkInterface[] = ips.map((ip, index) => ({
        name: `Network Interface ${index + 1}`,
        ip,
        url: `${protocol}//${ip}:${currentPort}/`,
      }))

      networkInterfaces.value = interfaces
      console.log('✅ Network interfaces set from real IPs:', interfaces)
    } catch (err) {
      console.error('❌ Error:', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch network interfaces'
      networkInterfaces.value = [] // Ensure empty on error
    } finally {
      loading.value = false
    }
  }

  const generateQRCodes = async () => {
    console.log('🔄 Generating QR codes for real IPs...')
    for (const iface of networkInterfaces.value) {
      if (!qrCodes[iface.url]) {
        try {
          qrCodes[iface.url] = await generateQRCode(iface.url)
          console.log('✅ QR generated for real IP:', iface.url)
        } catch (err) {
          console.error(`❌ QR failed for ${iface.url}:`, err)
        }
      }
    }
  }

  const initialize = async () => {
    console.log('🚀 Initializing useNetwork with real IP detection...')
    await fetchNetworkIPs()
    await generateQRCodes()
    console.log('✅ Initialization complete')
  }

  onMounted(() => {
    console.log('📌 Component mounted, calling initialize...')
    initialize()
  })

  return {
    networkInterfaces,
    qrCodes,
    loading,
    error,
    fetchNetworkIPs,
    generateQRCodes,
    initialize,
    refresh: initialize,
  }
}
