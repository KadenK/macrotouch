```vue
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
          <select>
            <option>3 × 3</option>
            <option>4 × 4</option>
            <option>5 × 5</option>
            <option>6 × 6</option>
          </select>
        </div>
      </div>
    </section>
  </div>
</template>

<script lang="ts" setup></script>

<style lang="postcss" scoped>
.settings-page {
  max-width: 650px;
  margin: auto;
  padding: 2rem;
}

.title {
  font-size: 2rem;
  font-weight: 600;
  margin-bottom: 2rem;
}

.section {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #ddd;
}

.section h2 {
  margin-bottom: 1rem;
}

.subsection {
  margin-top: 1rem;
  padding-left: 1rem;
}

.subsection h3 {
  margin-bottom: 0.5rem;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0.75rem 0;
}

select {
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  border: 1px solid #ccc;
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
  background: #ccc;
  transition: .25s;
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
  background: #4f46e5;
}

input:checked + .slider::before {
  transform: translateX(20px);
}
</style>
```
