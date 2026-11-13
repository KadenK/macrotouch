<template>
  <div ref="root" class="popover">
    <slot name="trigger" :open="open" :toggle="toggle" />

    <div v-if="open" class="popover-panel" :class="`popover-panel--${align}`" :role="role">
      <slot :close="close" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref, watch } from 'vue'

withDefaults(
  defineProps<{
    /** Which edge of the trigger the panel lines up with. */
    align?: 'start' | 'end'
    role?: 'menu' | 'dialog'
  }>(),
  { align: 'end', role: 'dialog' },
)

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  /** Fired whenever the panel closes, however it was closed. */
  close: []
}>()

const root = ref<HTMLElement | null>(null)

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

// Outside click / Escape close the panel. (Not focus-out, which a native color picker would trigger.)
function onPointerDown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) close()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

function listen(on: boolean) {
  const method = on ? 'addEventListener' : 'removeEventListener'
  document[method]('pointerdown', onPointerDown)
  document[method]('keydown', onKeydown)
}

watch(open, (isOpen) => {
  listen(isOpen)
  if (!isOpen) emit('close')
})

onBeforeUnmount(() => listen(false))
</script>

<style scoped>
.popover {
  position: relative;
  display: flex;
}

.popover-panel {
  position: absolute;
  top: calc(100% + var(--space-1));
  z-index: 50;
  background: var(--color-surface);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
}

.popover-panel--start {
  left: 0;
}

.popover-panel--end {
  right: 0;
}
</style>
