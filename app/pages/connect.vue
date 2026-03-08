<template>
  <div class="network-container">
    <h1 class="title">Connect your touch device to your computer using your browser</h1>

    <div v-if="loading" class="loading">
      <div class="pulse">Loading network interfaces...</div>
    </div>

    <div v-else-if="error" class="error">Error: {{ error }}</div>

    <div v-else-if="networkInterfaces.length === 0" class="empty-state">No private LAN IPv4 addresses found.</div>

    <div v-for="(iface, index) in networkInterfaces" :key="index" class="card">
      <div class="card-info">
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
        <div v-else class="qr-placeholder">Generating QR…</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useNetwork } from '../composables/getIPAddresses'

const { networkInterfaces, qrCodes, loading, error } = useNetwork()
</script>

<style scoped>
/* Container */
.network-container {
  padding: 1rem;
  background-color: hsl(0, 0%, 78%);
  font-family: sans-serif; /* optional fallback */
}

/* Title */
.title {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  text-align: center;
  color: inherit;
}

/* Loading and pulse animation */
.loading {
  margin-bottom: 1rem;
}
.pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
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

/* Error message */
.error {
  margin-bottom: 1rem;
  color: #dc2626; /* red-600 */
}

/* Empty state */
.empty-state {
  margin-bottom: 1rem;
  opacity: 0.8;
}

/* Cards */
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
  background-color: #969696;
  font-size: 1.5em;
}

/* Card info section */
.card-info {
  min-width: 260px;
}

/* Star indicator */
.star {
  color: #ffee00; /* gold */
  font-size: 1.2em;
  margin-left: 4px;
  cursor: default;
  display: inline-block;
}

/* Link */
.link {
  text-decoration: underline;
  color: #ffffff;
  transition: color 0.2s ease;
}
.link:hover {
  color: #2a486d;
}

/* QR container */
.qr img {
  width: 200px;
  height: 200px;
  display: block;
}

/* QR placeholder */
.qr-placeholder {
  width: 220px;
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  background: transparent;
  text-align: center;
}
</style>
