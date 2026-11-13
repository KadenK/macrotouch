<template>
  <header class="app-header">
    <NuxtLink to="/home" class="brand-link">
      <Icon class="logo" name="mt:logo" size="2rem" />
      <span class="brand">MacroTouch</span>
    </NuxtLink>

    <NavTabs class="header-tabs" aria-label="Main">
      <NavTab to="/home">Home</NavTab>
      <NavTab to="/connect">Connect</NavTab>
      <NavTab to="/settings">Settings</NavTab>
    </NavTabs>

    <div class="header-actions">
      <button
        v-if="canOpenMacroPad"
        type="button"
        class="btn btn-secondary macropad-btn"
        title="Open the MacroPad in its own window"
        @click="openMacroPad"
      >
        <Icon name="mdi:tablet-dashboard" size="1.1rem" />
        MacroPad
      </button>

      <ConnectionStatus inline />
    </div>
  </header>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import ConnectionStatus from '~/components/ConnectionStatus.vue'
import NavTab from '~/components/ui/NavTab.vue'
import NavTabs from '~/components/ui/NavTabs.vue'

/**
 * The MacroPad shortcut, shown only in the desktop app.
 *
 * A browser tab has no way to open a window the master would trust, so the
 * button would do nothing there; the phone reaches the same page by its URL.
 * Resolved on mount because the preload bridge is not there during SSR.
 */
type MacroPadAPI = { openMacroPad?: () => Promise<void> }

const canOpenMacroPad = ref(false)

onMounted(() => {
  canOpenMacroPad.value =
    typeof (window as unknown as { electronAPI?: MacroPadAPI }).electronAPI?.openMacroPad === 'function'
})

function openMacroPad() {
  void (window as unknown as { electronAPI?: MacroPadAPI }).electronAPI?.openMacroPad?.()
}
</script>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 3.5rem;
  padding: 0 var(--space-6);
  background: var(--color-surface);
  border-bottom: var(--border-width) solid var(--color-border);
}

.brand-link {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* The icon's glyphs span 28px of its 32px box; 2.4rem puts the "M" cap height at that same 28px. */
.brand {
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--color-primary);
}

.header-tabs {
  margin-left: var(--space-8);
}

/* Pushed to the right edge. The connection banner inside is only present while
   the connection is down, so the button sits on the edge the rest of the time. */
.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-left: auto;
}

.macropad-btn {
  padding: 0.35rem 0.85rem;
  white-space: nowrap;
}
</style>
