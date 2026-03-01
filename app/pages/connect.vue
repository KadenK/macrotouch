<template>
  <div class="p-4">
    <h1 class="text-xl font-semibold mb-2">Connect your touch device to your computer using your broswer</h1>
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
          <b>URL: </b>
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
/* ===== CONTAINER & LAYOUT ===== */
/* The main container (outer div) */
.p-4 {
  padding: 1rem; /* equivalent to 16px */
  background-color: hsl(0, 0%, 78%);
}

/* ===== TYPOGRAPHY ===== */
/* Heading 1 */
h1 {
  font-size: 1.5rem; /* text-xl */
  font-weight: 600; /* font-semibold */
  margin-bottom: 0.5rem; /* mb-2 */
  text-align: center;
}

/* Paragraph */
p {
  opacity: 0.8;
  margin-bottom: 1rem; /* mb-4 */
}

/* Links */
a.link {
  text-decoration: underline;
  color: #ffffff;
  transition: color 0.2s ease;
}
a.link:hover {
  color: #2a486d;
}

/* ===== CARDS ===== */
/* Individual card container */
.card {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  border: 1px solid #dddddd;
  border-radius: 12px;
  padding: 12px;
  margin: 12px 0;
  flex-wrap: wrap;
  background-color: #969696; /* you can change this */
  font-size: 1.5em;
}

/* Card info section */
.info {
  min-width: 260px;
}

/* QR code container */
.qr img {
  width: 200px;
  height: 200px;
  display: block;
}

/* Star indicator for primary interface */
.star {
  color: #ffee00; /* gold */
  font-size: 1.2em;
  margin-left: 4px;
  cursor: default; /* no click action */
  display: inline-block;
}

/* ===== UTILITY CLASSES ===== */
/* Loading animation */
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

/* Text color utilities (if needed) */
.text-red-600 {
  color: #dc2626; /* Tailwind red-600 */
}

/* Margin utilities (optional) */
.mb-4 {
  margin-bottom: 1rem;
}
</style>
