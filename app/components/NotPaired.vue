<template>
  <div v-if="show" class="not-paired" role="alert">
    <div class="panel">
      <!-- Inline rather than an <Icon>: the packaged master serves static files
           only, so the icon runtime has nothing to resolve a name against. -->
      <svg class="mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4.5" y="10.5" width="15" height="10" rx="2" stroke="currentColor" stroke-width="1.6" />
        <path d="M8 10.5V7.5a4 4 0 1 1 8 0v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <h1>This device is not paired</h1>
      <p>
        {{ reason }}
      </p>
      <p class="how">
        Open <strong>Connect</strong> on the computer running MacroTouch and scan the QR code again. Scanning replaces
        the token this device is holding.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { usePairingToken } from '~/composables/usePairingToken'
import { useWebSocket } from '~/composables/useWebSocket'

/**
 * Shown when the master refuses this device's pairing token.
 *
 * It covers the page rather than sitting alongside the layout: the last-known
 * screen is still rendered underneath, and tapping a macro on it would do
 * nothing — so leaving it reachable would read as the app being broken rather
 * than as this device being locked out.
 *
 * The refusal is terminal, so there is nothing to retry and no button to offer.
 * Re-pairing happens by scanning a fresh QR code, which arrives as a new token
 * in the URL and replaces the stored one.
 */
const { fatalError } = useWebSocket()
const { clientToken } = usePairingToken()

const show = computed(() => fatalError.value?.code === 'invalid-token')

// A device that never had a token is a different mistake from one whose token
// went stale, and the second is the one a regeneration causes.
const reason = computed(() =>
  clientToken.value
    ? 'Its pairing token is no longer valid. The computer may have regenerated it.'
    : 'It arrived without a pairing token, so the computer cannot tell it apart from any other device on the network.',
)
</script>

<style lang="postcss" scoped>
.not-paired {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: grid;
  place-items: center;
  padding: var(--space-6);
  background: var(--color-canvas);
}

.panel {
  max-width: 32rem;
  text-align: center;
  color: var(--color-ink);
}

.mark {
  width: 3rem;
  height: 3rem;
  color: var(--color-danger);
  margin-bottom: var(--space-3);
}

h1 {
  font-size: clamp(1.4rem, 4vw, 1.9rem);
  font-weight: 700;
  margin-bottom: var(--space-3);
}

p {
  color: var(--color-ink-2);
  line-height: 1.6;
  margin-bottom: var(--space-3);
}

.how {
  color: var(--color-muted);
  font-size: var(--text-sm);
  margin-bottom: 0;
}
</style>
