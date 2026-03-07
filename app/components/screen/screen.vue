<template>
  <div
    class="macro-grid"
    :style="{
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, auto)`,
    }"
  >
    <component
      :is="editable ? MacroEdit : MacroInteract"
      v-for="(item, index) in items"
      :key="index"
      :label="item.label"
      :icon="item.icon"
      @select-icon="handleSelectIcon(index)"
      class="grid-item"
    />
  </div>
</template>

<script lang="ts" setup>
import MacroEdit from '../macro/macroEdit.vue'
import MacroInteract from '../macro/macroInteract.vue'

const props = withDefaults(
  defineProps<{
    items: Array<{ label?: string; icon?: string | null }>
    columns?: number
    rows?: number
    editable?: boolean
  }>(),
  {
    columns: 5,
    rows: 3,
    editable: false,
  },
)

const emit = defineEmits<{
  (e: 'select-icon', index: number): void
}>()

const handleSelectIcon = (index: number) => {
  if (props.editable) {
    emit('select-icon', index)
  }
}
</script>

<style scoped>
.macro-grid {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  background-color: #e9e9e9;
  border-radius: 12px;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}

.grid-item {
  width: 100%;
  height: auto;
}
</style>
