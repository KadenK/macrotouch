<template>
  <div
    class="option action"
    :class="{ nested, highlighted, disabled: !selectable }"
    role="option"
    :aria-selected="selected"
    :aria-disabled="!selectable"
    @mousemove="selectable && emit('highlight')"
    @click="selectable && emit('select')"
  >
    <Icon v-if="action.icon" :name="action.icon" class="icon" />
    <span class="action-text"
      ><span>{{ action.label }}</span
      ><span v-if="action.description" class="secondary">{{ action.description }}</span></span
    >
    <StatusChip
      v-if="status"
      class="status"
      :tone="isSelectable(status) ? 'warning' : 'neutral'"
      :title="status.hint"
      >{{ status.message || status.status }}</StatusChip
    >
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ActionDescriptor, ActionGroup } from '~/../shared/types/node'
import { actionSelectable, isSelectable } from '~/../shared/types/plugin'
import StatusChip from '~/components/ui/StatusChip.vue'

/** One action in the action picker's list, with a chip when it or its plugin is not fully available. */
const props = defineProps<{
  action: ActionDescriptor
  group: ActionGroup
  /** Listed under a sub-heading. */
  nested: boolean
  highlighted: boolean
  selected: boolean
}>()
const emit = defineEmits<{ highlight: []; select: [] }>()

const selectable = computed(() => actionSelectable(props.group, props.action))
const status = computed(() => {
  const { group, action } = props
  if (!isSelectable(group.availability)) return group.availability
  if (action.availability && action.availability.status !== 'available') return action.availability
  return group.availability?.status !== 'available' ? group.availability : undefined
})
</script>

<style scoped>
.option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: var(--space-3);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--color-text-strong);
  font-size: var(--text-sm);
  cursor: pointer;
}
.option.nested {
  margin-left: var(--space-6);
}
.option.highlighted {
  background: var(--color-primary-50);
}
.option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.action-text {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}
.secondary {
  color: var(--color-text-faint);
  font-size: var(--text-xs);
}
.icon {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
}
.status {
  flex: none;
  max-width: 45%;
}
</style>
