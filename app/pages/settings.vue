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
        <span>Hide blank buttons</span>
        <label class="switch">
          <input type="checkbox" />
          <span class="slider"></span>
        </label>
      </div>

      <div class="setting-row">
        <span>Orientation</span>
        <select>
          <option>Landscape</option>
          <option>Portrait</option>
        </select>
      </div>
    </section>

    <!-- Defaults -->
    <section class="section">
      <h2>Defaults</h2>

      <div class="subsection">
        <h3>Screen</h3>

        <div class="setting-row">
          <span>Background color</span>
          <input type="color" />
        </div>

      <div class="setting-row">
        <span>Grid size</span>
        <div class="grid-size">
          <input type="number" min="1" step="1" placeholder="Cols" />
          <span class="grid-sep">×</span>
          <input type="number" min="1" step="1" placeholder="Rows" />
        </div>
      </div>
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup></script>

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
  background:
    var(--color-surface)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M5 7l5 6 5-6' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    no-repeat;
  background-position: right 0.7rem center;
  background-size: 1rem 1rem;
}

.grid-size {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.grid-size input {
  width: 4.5rem;
  padding: 0.45rem 0.6rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.grid-sep {
  color: var(--color-muted);
  font-weight: 600;
}

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
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  transition: .25s;
  border-radius: 50%;
}

input:checked + .slider {
  background: var(--color-primary);
}

input:checked + .slider::before {
  transform: translateX(20px);
}
</style>
