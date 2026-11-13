<template>
  <div class="home-content">
    <SidebarContent>
      <ScreenSidebar
        :screens="screenList"
        :selected-id="currentScreenId"
        @select="currentScreenId = $event"
        @add="createNewScreen"
        @rename="renameScreen"
        @delete="deleteScreen"
      />
    </SidebarContent>

    <div class="container">
      <ScreenHeader
        v-if="currentScreen"
        :screen="currentScreen"
        @rename="updateCurrentScreen({ name: $event })"
        @resize="updateCurrentScreen({ size: $event })"
        @background="updateCurrentScreen({ backgroundColor: colorFromHex($event) })"
        @macro-colors="onMacroColors"
        @delete="deleteCurrentScreen"
      />

      <div class="macro-surface">
        <MacroGridScreen v-if="currentScreenId" class="macro-grid" :screen-id="currentScreenId" :editable="true" />
        <div v-else class="empty-state">No screens yet. Create one to begin.</div>
      </div>
    </div>

    <ScreenEditModal
      v-model="isEditModalOpen"
      :screen-id="currentScreenId"
      :pending-screen="pendingNewScreen"
      @saved="onScreenSaved"
      @update:model-value="
        (v) => {
          if (!v) pendingNewScreen = null
        }
      "
    />

    <Modal v-model="applyColorsOpen" title="Apply new default colors?">
      <div class="confirm-body">
        <p>The default macro colors changed. Which existing macros on this screen should use the new colors?</p>
      </div>
      <template #footer>
        <div class="confirm-actions">
          <button class="cancel-btn" @click="applyColors('none')">None</button>
          <button class="save-btn" @click="applyColors('defaults')">Only default-colored</button>
          <button class="save-btn" @click="applyColors('all')">All macros</button>
        </div>
      </template>
    </Modal>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMacroStore } from '~/stores/macro'
import MacroGridScreen from '../components/screen/screen.vue'
import { createMacroScreen, colorFromHex } from '~/../shared/types'
import type { Color, MacroScreen } from '~/../shared/types'
import Modal from '~/components/ui/Modal.vue'
import ScreenEditModal from '~/components/screen/ScreenEditModal.vue'
import ScreenHeader from '~/components/screen/ScreenHeader.vue'
import ScreenSidebar from '~/components/screen/ScreenSidebar.vue'
import SidebarContent from '~/components/layout/SidebarContent.vue'

definePageMeta({ layout: 'sidebar' })

const store = useMacroStore()
const { settings } = storeToRefs(store)

const isEditModalOpen = ref(false)
const currentScreenId = ref<string>('')
const pendingNewScreen = ref<ReturnType<typeof createMacroScreen> | null>(null)

const screenList = computed(() => store.getScreenList())

const currentScreen = computed(() => (currentScreenId.value ? store.getScreen(currentScreenId.value) : undefined))

function updateCurrentScreen(patch: Partial<MacroScreen>) {
  if (currentScreen.value) store.updateScreen({ ...currentScreen.value, ...patch })
}

function deleteScreen(id: string) {
  const screen = store.getScreen(id)
  if (!screen) return
  if (confirm(`Are you sure you want to delete the screen "${screen.name}"?`)) {
    store.deleteScreen(id)
    if (id === currentScreenId.value) onScreenDeleted()
  }
}

function deleteCurrentScreen() {
  if (currentScreenId.value) deleteScreen(currentScreenId.value)
}

function renameScreen(id: string, name: string) {
  const screen = store.getScreen(id)
  if (screen) store.updateScreen({ ...screen, name })
}

// --- Default macro colors ---
const FALLBACK_ICON: Color = { r: 0, g: 0, b: 0 }
const FALLBACK_BG: Color = { r: 255, g: 255, b: 255 }

const applyColorsOpen = ref(false)
const pendingMacroColors = ref<{ icon: Color; background: Color } | null>(null)

function sameColor(a?: Color, b?: Color) {
  return !!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b
}

function onMacroColors(colors: { icon: string; background: string }) {
  const screen = currentScreen.value
  if (!screen) return
  pendingMacroColors.value = { icon: colorFromHex(colors.icon), background: colorFromHex(colors.background) }
  const hasMacros = screen.macroRows.some((r) => r.macrosIds.some((id) => id && store.getMacro(id)))
  if (hasMacros) applyColorsOpen.value = true
  else applyColors('none')
}

function applyColors(mode: 'all' | 'defaults' | 'none') {
  applyColorsOpen.value = false
  const screen = currentScreen.value
  const next = pendingMacroColors.value
  pendingMacroColors.value = null
  if (!screen || !next) return

  if (mode !== 'none') {
    const oldIcon = screen.defaultMacroIconColor ?? FALLBACK_ICON
    const oldBg = screen.defaultMacroBackgroundColor ?? FALLBACK_BG
    for (const row of screen.macroRows) {
      for (const id of row.macrosIds) {
        const macro = id ? store.getMacro(id) : undefined
        if (!macro) continue
        const updated = { ...macro }
        if (mode === 'all' || sameColor(macro.iconColor, oldIcon)) updated.iconColor = next.icon
        if (mode === 'all' || sameColor(macro.backgroundColor, oldBg)) updated.backgroundColor = next.background
        store.updateMacro(updated, id)
      }
    }
  }
  updateCurrentScreen({ defaultMacroIconColor: next.icon, defaultMacroBackgroundColor: next.background })
}

function ensureScreenExists() {
  if (screenList.value.length === 0) {
    const defaultScreen = createMacroScreen(
      'Default Screen',
      { ...settings.value.defaultScreenSize },
      { ...settings.value.defaultScreenBgColor },
      { ...settings.value.defaultMacroIconColor },
      { ...settings.value.defaultMacroBackgroundColor },
    )
    store.addScreen(defaultScreen)
    currentScreenId.value = defaultScreen.id
  } else {
    currentScreenId.value = screenList.value[0].id
  }
}

onMounted(() => {
  if (!store.isReady) {
    const stop = watch(
      () => store.isReady,
      (ready) => {
        if (ready) {
          stop()
          ensureScreenExists()
        }
      },
    )
  } else {
    ensureScreenExists()
  }
})

watch(screenList, (screens) => {
  if (!currentScreenId.value && screens.length) {
    currentScreenId.value = screens[0].id
  }
})

function createNewScreen() {
  const newScreen = createMacroScreen(
    'Screen',
    { ...settings.value.defaultScreenSize },
    { ...settings.value.defaultScreenBgColor },
    { ...settings.value.defaultMacroIconColor },
    { ...settings.value.defaultMacroBackgroundColor },
  )
  pendingNewScreen.value = newScreen
  isEditModalOpen.value = true
}

function onScreenSaved(savedId: string) {
  pendingNewScreen.value = null
  currentScreenId.value = savedId
}

function onScreenDeleted() {
  if (screenList.value.length > 0) {
    currentScreenId.value = screenList.value[0].id
  } else {
    currentScreenId.value = ''
  }
}
</script>

<style scoped>
.home-content {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
  padding: var(--space-6);
}

.home-content .container {
  width: 100%;
}

.confirm-body {
  padding: 1.5rem;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.empty-state {
  padding: var(--space-8);
  border-radius: var(--radius-lg);
  background: var(--color-primary-50);
  color: var(--color-muted);
}

.macro-surface {
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  border: var(--border-width) solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

.macro-grid {
  width: 100%;
  max-width: 70rem;
  min-width: 30rem;
  height: 100%;
  min-height: 20rem;
  max-height: 50rem;
}
</style>
