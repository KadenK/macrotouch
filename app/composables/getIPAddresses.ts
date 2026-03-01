// composables/getIPAddresses.ts
import { ref, reactive, onMounted } from 'vue'
import QRCode from 'qrcode'

type NetworkInterface = {
  name: string
  ip: string
  url: string
}

export const useNetwork = () => {
  const networkInterfaces = ref<NetworkInterface[]>([])
  const qrCodes = reactive<Record<string, string>>({})
  const loading = ref(true)
  const error = ref<string | null>(null)

  const generateQRCode = async (url: string): Promise<string> => {
    return await QRCode.toDataURL(url, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
  }

  const fetchNetworkIPs = async () => {
    loading.value = true
    error.value = null
    try {
      // ✅ Correct fetch to Nuxt server API
      const data = await $fetch<{ name: string; ip: string }[]>('/api/getIP')

      // ✅ Safety check: ensure data is an array
      if (!Array.isArray(data)) {
        throw new Error('API did not return an array')
      }

      const currentPort = window.location.port || '3000' // default Nuxt port
      const protocol = window.location.protocol

      networkInterfaces.value = data.map((item) => ({
        name: item.name,
        ip: item.ip,
        url: `${protocol}//${item.ip}:${currentPort}/`,
      }))
    } catch (err) {
      console.error('Failed to fetch host IPs:', err)
      // ❌ Removed the inner 'error' declaration that was shadowing the outer one
      error.value = 'Could not detect local network interfaces.'
    } finally {
      loading.value = false
    }
  }

  const generateQRCodes = async () => {
    for (const iface of networkInterfaces.value) {
      if (!qrCodes[iface.url]) {
        try {
          qrCodes[iface.url] = await generateQRCode(iface.url)
        } catch (err) {
          console.error(`QR failed for ${iface.url}:`, err)
        }
      }
    }
  }

  const initialize = async () => {
    await fetchNetworkIPs()
    await generateQRCodes()
  }

  onMounted(() => {
    initialize()
  })

  return {
    networkInterfaces,
    qrCodes,
    loading,
    error,
    refresh: initialize,
  }
}
