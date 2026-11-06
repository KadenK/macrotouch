<template>
  <div class="settings-page">
    <SidebarContent>
      <SidebarSection title="Settings">
        <SidebarItem v-for="s in sections" :key="s.id" :selected="s.id === section" @click="section = s.id">
          {{ s.label }}
        </SidebarItem>
      </SidebarSection>
    </SidebarContent>

    <div class="settings-content">
        <h1 class="title">{{ currentLabel }}</h1>

        <!-- Editor -->
        <template v-if="section === 'editor'">
          <SettingsGroup title="UI">
            <SettingRow label="Dark mode">
              <ToggleSwitch :model-value="isDark" aria-label="Dark mode" @update:model-value="toggleTheme" />
            </SettingRow>
            <SettingRow label="Show macro labels">
              <ToggleSwitch v-model="showEditorLabels" aria-label="Show macro labels" />
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="System">
            <SettingRow label="Start on boot">
              <ToggleSwitch v-model="startOnBoot" aria-label="Start on boot" />
            </SettingRow>

            <template v-if="desktop">
              <SettingRow label="Show tray icon">
                <ToggleSwitch v-model="trayEnabled" aria-label="Show tray icon" />
              </SettingRow>
              <SettingRow
                label="Minimize on close"
                :hint="trayEnabled ? undefined : '&quot;Show tray icon&quot; must be enabled'"
                :disabled="!trayEnabled"
              >
                <ToggleSwitch v-model="minimizeOnClose" :disabled="!trayEnabled" aria-label="Minimize on close" />
              </SettingRow>
            </template>
          </SettingsGroup>
        </template>

        <!-- Remote -->
        <template v-else-if="section === 'remote'">
          <SettingsGroup title="Display">
            <SettingRow label="Show macro labels">
              <ToggleSwitch v-model="showRemoteLabels" aria-label="Show macro labels" />
            </SettingRow>
            <SettingRow label="Hide blank buttons">
              <ToggleSwitch v-model="hideBlankButtons" aria-label="Hide blank buttons" />
            </SettingRow>
            <SettingRow label="Attempt to Fullscreen">
              <ToggleSwitch v-model="attemptFullscreen" aria-label="Attempt to Fullscreen" />
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="Interaction">
            <SettingRow label="Button haptics">
              <ToggleSwitch v-model="buttonHaptics" aria-label="Button haptics" />
            </SettingRow>
            <SettingRow label="Swipe to change screens">
              <ToggleSwitch v-model="swipeToChangeScreens" aria-label="Swipe to change screens" />
            </SettingRow>
          </SettingsGroup>
        </template>

        <!-- Defaults -->
        <template v-else>
          <SettingsGroup title="Screen">
            <SettingRow label="Background color">
              <ColorInput v-model="screenBgHex" label="Default screen background color" />
            </SettingRow>
            <SettingRow label="Grid size">
              <GridSizeInput :size="screenSize" @resize="screenSize = $event" />
            </SettingRow>
          </SettingsGroup>

          <SettingsGroup title="Macro">
            <SettingRow label="Icon color">
              <ColorInput v-model="macroIconHex" label="Default macro icon color" />
            </SettingRow>
            <SettingRow label="Background color">
              <ColorInput v-model="macroBgHex" label="Default macro background color" />
            </SettingRow>
          </SettingsGroup>
        </template>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useMacroStore } from '~/stores/macro'
import { useTheme } from '~/composables/useTheme'
import { colorFromHex, colorToHex } from '~/../shared/types'
import type { MacroSettings } from '~/../shared/types'
import ColorInput from '~/components/input/colorInput.vue'
import SidebarContent from '~/components/layout/SidebarContent.vue'
import GridSizeInput from '~/components/screen/GridSizeInput.vue'
import SettingRow from '~/components/settings/SettingRow.vue'
import SettingsGroup from '~/components/settings/SettingsGroup.vue'
import SidebarItem from '~/components/ui/SidebarItem.vue'
import SidebarSection from '~/components/ui/SidebarSection.vue'
import ToggleSwitch from '~/components/ui/ToggleSwitch.vue'

definePageMeta({ layout: 'sidebar' })

// --- Sections (sidebar tabs) ---
const sections = [
  { id: 'editor', label: 'Editor' },
  { id: 'remote', label: 'Remote' },
  { id: 'defaults', label: 'Defaults' },
] as const

const section = ref<(typeof sections)[number]['id']>('editor')
const currentLabel = computed(() => sections.find((s) => s.id === section.value)?.label)

const { isDark, toggle: toggleTheme } = useTheme()

// --- Settings: every control saves as soon as it changes ---
const store = useMacroStore()
const { settings } = storeToRefs(store)

/** A two-way binding to one setting; writing it saves immediately. */
function setting<K extends keyof MacroSettings>(key: K) {
  return computed({
    get: () => settings.value[key],
    set: (value: MacroSettings[K]) => store.updateSettings({ [key]: value }),
  })
}

/** Same, for a color setting edited as a hex string. */
function colorSetting(key: 'defaultScreenBgColor' | 'defaultMacroIconColor' | 'defaultMacroBackgroundColor') {
  return computed({
    get: () => colorToHex(settings.value[key]),
    set: (hex: string) => store.updateSettings({ [key]: colorFromHex(hex) }),
  })
}

const showEditorLabels = setting('showEditorLabels')
const showRemoteLabels = setting('showRemoteLabels')
const hideBlankButtons = setting('hideBlankButtons')
const attemptFullscreen = setting('attemptFullscreen')
const swipeToChangeScreens = setting('swipeToChangeScreens')
const screenBgHex = colorSetting('defaultScreenBgColor')
const macroIconHex = colorSetting('defaultMacroIconColor')
const macroBgHex = colorSetting('defaultMacroBackgroundColor')
const screenSize = setting('defaultScreenSize')

// Not wired up yet.
const startOnBoot = ref(false)
const buttonHaptics = ref(false)

// --- Desktop app settings (only present inside Electron) ---
type DesktopSettings = { trayEnabled: boolean; minimizeOnClose: boolean }
type DesktopSettingsAPI = {
  getDesktopSettings: () => Promise<DesktopSettings>
  updateDesktopSettings: (patch: Partial<DesktopSettings>) => Promise<DesktopSettings>
}
const electronAPI = import.meta.client
  ? (window as unknown as { electronAPI?: DesktopSettingsAPI }).electronAPI
  : undefined

const desktop = ref<DesktopSettings | null>(null)

onMounted(async () => {
  if (electronAPI?.getDesktopSettings) desktop.value = await electronAPI.getDesktopSettings()
})

function desktopSetting<K extends keyof DesktopSettings>(key: K) {
  return computed({
    get: () => desktop.value?.[key] ?? false,
    set: async (value: DesktopSettings[K]) => {
      if (!desktop.value) return
      desktop.value = { ...desktop.value, [key]: value }
      desktop.value = await electronAPI!.updateDesktopSettings({ [key]: value })
    },
  })
}

const trayEnabled = desktopSetting('trayEnabled')
const minimizeOnClose = desktopSetting('minimizeOnClose')
</script>

<style scoped>
.settings-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-6);
}

.settings-content {
  max-width: 650px;
  margin: 0 auto;
}

.title {
  font-size: clamp(1.8rem, 2.8vw, 2.4rem);
  font-weight: 700;
  margin-bottom: var(--space-6);
  color: var(--color-ink);
}
</style>
