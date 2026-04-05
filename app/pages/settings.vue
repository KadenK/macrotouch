<template>
  <div class="settings-page">
    <h1 class="title">Settings</h1>

    <!-- General -->
    <section class="section">
      <h2>General</h2>

      <div class="setting-row">
        <span>Start on boot</span>
        <label class="switch">
          <input type="checkbox" />
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <span>Minimize on close</span>
        <label class="switch">
          <input type="checkbox" />
          <span class="slider"></span>
        </label>
      </div>
    </section>

    <!-- Device -->
    <section class="section">
      <h2>Device</h2>

      <div class="setting-row">
        <span>Button haptics</span>
        <label class="switch">
          <input type="checkbox" />
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <span>Swipe to change screens</span>
        <label class="switch">
          <input type="checkbox" v-model="form.swipeToChangeScreens" />
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <span>Hide blank buttons</span>
        <label class="switch">
          <input type="checkbox" />
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <span>Attempt to Fullscreen</span>
        <label class="switch">
          <input type="checkbox" v-model="form.attemptFullscreen" />
          <span class="slider"></span>
        </label>
      </div>
    </section>

    <!-- Defaults -->
    <section class="section">
      <h2>Defaults</h2>

      <div class="subsection">
        <h3>Screen</h3>

        <div class="setting-row">
          <span>Background color</span>
          <input type="color" v-model="form.bgColorHex" />
        </div>

        <div class="setting-row">
          <span>Grid size</span>
          <div class="grid-size-inputs">
            <div class="grid-size-field">
              <label class="sub-label">Rows</label>
              <input type="number" min="1" max="20" step="1" class="grid-input" v-model.number="form.rows" />
            </div>
            <span class="grid-divider">×</span>
            <div class="grid-size-field">
              <label class="sub-label">Columns</label>
              <input type="number" min="1" max="20" step="1" class="grid-input" v-model.number="form.columns" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Actions -->
    <div class="page-actions">
      <button class="cancel-btn" @click="cancel">Cancel</button>
      <button class="save-btn" @click="save">Save</button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMacroStore } from '~/stores/macro'
import { colorFromHex, colorToHex } from '~/../types'
import { useRouter } from 'vue-router'

const store = useMacroStore()
const { settings } = storeToRefs(store)
const router = useRouter()

function buildForm() {
  return {
    bgColorHex: colorToHex(settings.value.defaultScreenBgColor),
    rows: settings.value.defaultScreenSize.rows,
    columns: settings.value.defaultScreenSize.columns,
    swipeToChangeScreens: settings.value.swipeToChangeScreens,
    attemptFullscreen: settings.value.attemptFullscreen,
  }
}

const form = ref(buildForm())

watch(
  settings,
  () => {
    form.value = buildForm()
  },
  { deep: true },
)

function save() {
  store.updateSettings({
    defaultScreenBgColor: colorFromHex(form.value.bgColorHex),
    defaultScreenSize: {
      rows: Math.max(1, Math.min(20, form.value.rows)),
      columns: Math.max(1, Math.min(20, form.value.columns)),
    },
    swipeToChangeScreens: form.value.swipeToChangeScreens,
    attemptFullscreen: form.value.attemptFullscreen,
  })
  router.push('/home')
}

function cancel() {
  form.value = buildForm()
}
</script>

<style lang="postcss" scoped>
.settings-page {
  max-width: 650px;
  margin: 0 auto;
  padding: var(--space-6);
}

.title {
  font-size: clamp(1.8rem, 2.8vw, 2.4rem);
  font-weight: 700;
  margin-bottom: var(--space-6);
  color: var(--color-ink);
}

.section {
  margin-bottom: var(--space-6);
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.section h2 {
  margin-bottom: var(--space-4);
}

.subsection {
  margin-top: var(--space-4);
  padding-left: var(--space-4);
  border-left: 2px solid var(--color-primary-50);
}

.subsection h3 {
  margin-bottom: var(--space-2);
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: var(--space-3) 0;
  color: var(--color-ink-2);
}

select {
  appearance: none;
  padding: 0.45rem 2.25rem 0.45rem 0.75rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7l5 6 5-6' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    no-repeat;
  background-position: right 0.7rem center;
  background-size: 1rem 1rem;
}

/* Grid size */
.grid-size-inputs {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
}

.grid-size-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sub-label {
  font-size: 0.8rem;
  color: #6b7280;
  font-weight: 500;
}

.grid-input {
  width: 5rem;
  text-align: center;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.95rem;
  color: #111827;
  background: white;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
}

.grid-divider {
  font-size: 1.25rem;
  color: #9ca3af;
  padding-bottom: 0.4rem;
}

/* Page actions */
.page-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.cancel-btn,
.save-btn {
  padding: 0.5rem 1.25rem;
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.95rem;
  cursor: pointer;
}

.cancel-btn {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-ink-2);

  &:hover {
    background-color: var(--color-primary-50);
  }
}

.save-btn {
  background-color: var(--color-primary);
  color: white;

  &:hover {
    filter: brightness(1.1);
  }
}

/* Toggles */
.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #e2e8f0;
  transition: 0.25s;
  border-radius: 24px;
}

.slider::before {
  position: absolute;
  content: '';
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  transition: 0.25s;
  border-radius: 50%;
}

input:checked + .slider {
  background: var(--color-primary);
}

input:checked + .slider::before {
  transform: translateX(20px);
}
</style>
