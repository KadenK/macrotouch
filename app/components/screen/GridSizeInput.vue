<template>
  <div class="grid-size" aria-label="Grid size">
    <UnderlineInput v-model="rows" class="size-input" type="number" min="1" max="20" aria-label="Rows" @change="commit" />
    <span class="size-divider" aria-hidden="true">×</span>
    <UnderlineInput
      v-model="columns"
      class="size-input"
      type="number"
      min="1"
      max="20"
      aria-label="Columns"
      @change="commit"
    />
  </div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import UnderlineInput from '~/components/ui/UnderlineInput.vue'

const MIN = 1
const MAX = 20

const props = defineProps<{
  size: { rows: number; columns: number }
}>()

const emit = defineEmits<{
  resize: [size: { rows: number; columns: number }]
}>()

const rows = ref<string | number>(props.size.rows)
const columns = ref<string | number>(props.size.columns)

watch(
  () => [props.size.rows, props.size.columns],
  () => {
    rows.value = props.size.rows
    columns.value = props.size.columns
  },
)

function clamp(value: string | number, fallback: number) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(MIN, Math.min(MAX, Math.round(n))) : fallback
}

function commit() {
  const next = { rows: clamp(rows.value, props.size.rows), columns: clamp(columns.value, props.size.columns) }
  rows.value = next.rows
  columns.value = next.columns
  if (next.rows !== props.size.rows || next.columns !== props.size.columns) emit('resize', next)
}
</script>

<style scoped>
.grid-size {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.size-divider {
  color: var(--color-muted);
  font-size: 1rem;
  line-height: 1;
}

.size-input {
  width: 40px;
  font-size: 1rem;
  font-weight: 500;
  text-align: center;
}
</style>
