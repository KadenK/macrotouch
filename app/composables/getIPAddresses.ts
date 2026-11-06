// composables/getIPAddresses.ts
import { ref, computed, reactive, watch, onMounted } from 'vue'
import QRCode from 'qrcode'
import { usePairingToken, withToken } from './usePairingToken'

type NetworkInterface = {
  name: string
  ip: string
  url: string
}

export const useNetwork = () => {
  const addresses = ref<{ name: string; ip: string }[]>([])
  const qrCodes = reactive<Record<string, string>>({})
  const loading = ref(true)
  const error = ref<string | null>(null)

  // The token arrives on the snapshot, which may land after this page mounts,
  // and changes again whenever it is regenerated. Deriving the URLs from it
  // rather than building them once is what makes both cases redraw the QR.
  const { hostToken } = usePairingToken()

  const protocol = ref('http:')
  const currentPort = ref('3000') // default Nuxt port

  const networkInterfaces = computed<NetworkInterface[]>(() =>
    addresses.value.map((item) => ({
      name: item.name,
      ip: item.ip,
      url: withToken(`${protocol.value}//${item.ip}:${currentPort.value}/screen`, hostToken.value),
    })),
  )

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

      currentPort.value = window.location.port || currentPort.value
      protocol.value = window.location.protocol

      addresses.value = data
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

  // Covers both the first fetch and a token that arrives or changes afterwards.
  watch(networkInterfaces, generateQRCodes)

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
    hostToken,
    loading,
    error,
    refresh: initialize,
  }
}
