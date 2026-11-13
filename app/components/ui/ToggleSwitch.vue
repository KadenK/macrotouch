<template>
  <label class="switch">
    <input v-bind="$attrs" v-model="model" type="checkbox" role="switch" />
    <span class="slider"></span>
  </label>
</template>

<script lang="ts" setup>
// Attributes such as `disabled` and `aria-label` fall through to the <input>.
defineOptions({ inheritAttrs: false })

const model = defineModel<boolean>({ default: false })
</script>

<style scoped>
.switch {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
  width: 44px;
  height: 24px;
}

.switch input {
  position: absolute;
  inset: 0;
  z-index: 1;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.slider {
  position: absolute;
  inset: 0;
  background: var(--color-border-strong);
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

input:disabled {
  cursor: not-allowed;
}
</style>
