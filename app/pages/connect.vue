<template>
  <div class="page connect-page">
    <div class="container">
      <header class="connect-header">
        <h1>Connect your touch device</h1>
        <p class="subtitle">
          Open the URL on your phone/tablet browser or scan the QR code to pair with this computer.
        </p>
      </header>

      <div v-if="loading" class="card status-card">
        <div class="pulse">Loading network interfaces...</div>
      </div>

      <div v-else-if="error" class="card status-card status-error">Error: {{ error }}</div>

      <div v-else-if="networkInterfaces.length === 0" class="card status-card status-empty">
        No private LAN IPv4 addresses found.
      </div>

      <div v-else class="interface-list">
        <div v-for="(iface, index) in networkInterfaces" :key="index" class="card interface-card">
          <div class="card-main">
            <div class="card-title">
              <span class="label">Interface</span>
              <span class="value">{{ iface.name }}</span>
              <span v-if="index === 0" class="badge" title="Primary interface (recommended)">Primary</span>
            </div>

            <div class="card-row">
              <span class="label">IP</span>
              <span class="value mono">{{ iface.ip }}</span>
            </div>

            <div class="card-row">
              <span class="label">URL</span>
              <a :href="iface.url" target="_blank" rel="noopener noreferrer" class="link">
                {{ iface.url }}
              </a>
            </div>
          </div>

          <div class="qr">
            <img v-if="qrCodes[iface.url]" :src="qrCodes[iface.url]" :alt="`QR code for ${iface.url}`" />
            <div v-else class="qr-placeholder">Generating QR…</div>
          </div>
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
.connect-page {
  padding-bottom: var(--space-8);
}

.connect-header {
  max-width: 40rem;
  margin-bottom: var(--space-6);
}

.subtitle {
  font-size: var(--text-lg);
  color: var(--color-muted);
  margin-top: var(--space-2);
}

.status-card {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  color: var(--color-ink-2);
}

.status-error {
  border-color: rgba(220, 38, 38, 0.35);
  background: rgba(220, 38, 38, 0.04);
  color: var(--color-danger);
}

.status-empty {
  color: var(--color-muted);
  background: var(--color-primary-50);
}

.pulse {
  animation: pulse 2s var(--ease-out) infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.interface-list {
  display: grid;
  gap: var(--space-6);
}

.interface-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: var(--space-6);
  align-items: center;
}

.card-main {
  display: grid;
  gap: var(--space-4);
}

.card-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.card-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.label {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--color-muted);
  font-weight: 600;
}

.value {
  font-size: var(--text-lg);
  color: var(--color-ink);
  font-weight: 600;
}

.mono {
  font-family: var(--font-mono);
  font-size: var(--text-base);
  font-weight: 500;
}

.badge {
  padding: 0.15rem 0.6rem;
  border-radius: var(--radius-pill);
  background: var(--color-primary-50);
  color: var(--color-primary-600);
  border: 1px solid rgba(29, 78, 216, 0.2);
  font-size: var(--text-xs);
  font-weight: 700;
}

.link {
  color: var(--color-primary);
  font-weight: 600;
  font-size: var(--text-base);
  word-break: break-all;
}

.link:hover {
  color: var(--color-primary-600);
}

.qr {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background: var(--color-canvas);
  border: 1px dashed var(--color-border);
  min-height: 220px;
}

.qr img {
  width: 200px;
  height: 200px;
  display: block;
}

.qr-placeholder {
  text-align: center;
  color: var(--color-muted);
  font-size: var(--text-sm);
}

@media (max-width: 900px) {
  .interface-card {
    grid-template-columns: 1fr;
  }

  .qr {
    justify-content: flex-start;
  }
}
</style>
