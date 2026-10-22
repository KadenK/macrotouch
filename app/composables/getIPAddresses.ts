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
      const { masterHost, masterHttpPort } = useRuntimeConfig().public
      const data = await $fetch<{ name: string; ip: string }[]>(
        `${window.location.protocol}//${masterHost || window.location.hostname}:${masterHttpPort}/api/ip`,
      )

      const currentPort = window.location.port || '3000' // default Nuxt port
      const protocol = window.location.protocol

      networkInterfaces.value = data.map((item) => ({
        name: item.name,
        ip: item.ip,
        url: `${protocol}//${item.ip}:${currentPort}/screen`,
      }))
    } catch (err) {
      console.error('Failed to fetch host IPs:', err)
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
