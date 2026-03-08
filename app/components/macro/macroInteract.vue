<template>
  <div class="macro-container">
    <button class="macro">
      <Icon v-if="icon" :name="`ic:${icon}`" class="macro-icon" />
      <span v-else class="placeholder-icon">+</span>
    </button>
    <span class="macro-label">{{ label }}</span>
  </div>
</template>

<script lang="ts" setup>
// If Icon is not globally registered, import it here:
// import Icon from 'path/to/Icon.vue'

defineProps<{
  label?: string
  icon?: string | null
}>()
</script>

<style lang="postcss" scoped>
.macro-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  width: 100%;
  height: 100%;
}

.macro {
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0;
  border: none;
  border-radius: 8px;
  background-color: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow:
    0 4px 6px -1px rgb(0 0 0 / 0.1),
    0 2px 4px -2px rgb(0 0 0 / 0.1);
}

.macro:hover {
  box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.1);
  transform: scale(0.98);
}

.placeholder-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
  color: #3b82f6;
  background: transparent;
  border-radius: 0;
}

.macro-icon {
  width: 40px;
  height: 40px;
  font-size: 28px;
}

.macro-label {
  font-size: 0.75rem;
  color: #333;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
