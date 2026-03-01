<template>
  <div class="p-4">
    <h1 class="text-xl font-semibold mb-2">Connect your mobile device to this Computer</h1>
    <p class="opacity-80 mb-4">Scan a QR code to open your macro board from your phone/computer on the LAN.</p>

    <div v-if="loading" class="mb-4">
      <div class="animate-pulse">Loading network interfaces...</div>
    </div>

    <div v-else-if="error" class="mb-4 text-red-600">Error: {{ error }}</div>

    <div v-else-if="networkInterfaces.length === 0" class="mb-4">No private LAN IPv4 addresses found.</div>

    <div v-for="(iface, index) in networkInterfaces" :key="index" class="card">
      <div class="info">
        <div>
          <b>Interface:</b> {{ iface.name }}
          <span v-if="index === 0" class="star" title="Primary interface (recommended)">★</span>
        </div>
        <div><b>IP:</b> {{ iface.ip }}</div>
        <div>
          <b>URL:</b>
          <a :href="iface.url" target="_blank" rel="noopener noreferrer" class="link">
            {{ iface.url }}
          </a>
        </div>
      </div>

      <div class="qr">
        <img v-if="qrCodes[iface.url]" :src="qrCodes[iface.url]" :alt="`QR code for ${iface.url}`" loading="lazy" />
        <div v-else class="opacity-80 flex items-center justify-center" style="width: 220px; height: 220px">
          Generating QR…
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useNetwork } from '../composables/getIPAddresses'

const { networkInterfaces, qrCodes, loading, error } = useNetwork()
</script>

<style scoped>
.card {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 12px;
  margin: 12px 0;
  flex-wrap: wrap;
}

.info {
  min-width: 260px;
}

.link {
  text-decoration: underline;
  color: #0066cc;
}

.link:hover {
  color: #004499;
}

.qr img {
  width: 220px;
  height: 220px;
  display: block;
}

/* Star styling */
.star {
  color: #f5b342; /* gold color */
  font-size: 1.2em;
  margin-left: 4px;
  cursor: default; /* no click action */
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
