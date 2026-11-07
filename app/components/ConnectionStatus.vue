<template>
  <transition name="connection-fade">
    <div
      v-if="message"
      class="connection-banner"
      :class="[`connection-banner--${tone}`, { 'connection-banner--inline': inline }]"
      role="status"
      aria-live="polite"
    >
      {{ message }}
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useWebSocket } from '~/composables/useWebSocket'

/**
 * Says when the layout on screen is no longer backed by a live connection.
 *
 * Nothing is shown while connected, or during the first connect — a banner on
 * every page load would be noise. It appears once a retry is pending, which is
 * the first moment the displayed state can actually be stale.
 */
defineProps<{
  /** Sit in the normal flow (e.g. inside a header) instead of floating over the page. */
  inline?: boolean
}>()

const { status, fatalError } = useWebSocket()

const message = computed(() => {
  if (status.value === 'offline') {
    return fatalError.value ? `Disconnected: ${fatalError.value.message}` : 'Disconnected from Server.'
  }
  if (status.value === 'reconnecting') return 'Reconnecting… showing the last known layout.'
  return ''
})

const tone = computed(() => (status.value === 'offline' ? 'fatal' : 'warning'))
</script>

<style lang="postcss" scoped>
.connection-banner {
  position: fixed;
  top: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  max-width: 90vw;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-pill);
  font-size: 0.85rem;
  text-align: center;
  color: #fff;
  /* The controller fills the viewport, so this floats over it without
     swallowing taps meant for a macro. */
  z-index: 10000;
  pointer-events: none;
}

.connection-banner--inline {
  position: static;
  transform: none;
  z-index: auto;
  flex-shrink: 0;
  white-space: nowrap;
}

.connection-banner--warning {
  background: var(--color-warning);
}

.connection-banner--fatal {
  background: var(--color-danger);
}

.connection-fade-enter-active,
.connection-fade-leave-active {
  transition: opacity 180ms ease;
}

.connection-fade-enter-from,
.connection-fade-leave-to {
  opacity: 0;
}
</style>
