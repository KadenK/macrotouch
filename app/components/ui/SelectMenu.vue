<template>
  <div ref="root" class="select-menu" @focusout="onFocusOut">
    <button
      ref="trigger"
      type="button"
      class="select-trigger"
      :class="{ 'select-trigger--open': isOpen }"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span class="select-value">{{ selectedLabel }}</span>
      <svg class="select-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M5 7l5 6 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <transition name="select-pop">
      <ul v-if="isOpen" ref="list" class="select-list" role="listbox" tabindex="-1" @keydown="onListKeydown">
        <li
          v-for="(option, index) in options"
          :key="option.value"
          role="option"
          class="select-option"
          :class="{
            'select-option--active': index === activeIndex,
            'select-option--selected': option.value === modelValue,
          }"
          :aria-selected="option.value === modelValue"
          @pointerenter="activeIndex = index"
          @click="choose(option.value)"
        >
          <span class="select-option-label">{{ option.label }}</span>
        </li>
      </ul>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

const props = defineProps<{
  modelValue: string
  options: { value: string; label: string }[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const list = ref<HTMLUListElement | null>(null)
const isOpen = ref(false)
const activeIndex = ref(0)

const selectedLabel = computed(() => props.options.find((o) => o.value === props.modelValue)?.label ?? '')

async function open() {
  isOpen.value = true
  activeIndex.value = Math.max(
    0,
    props.options.findIndex((o) => o.value === props.modelValue),
  )
  await nextTick()
  list.value?.focus()
  scrollActiveIntoView()
}

function close(refocus = false) {
  isOpen.value = false
  if (refocus) trigger.value?.focus()
}

function toggle() {
  if (isOpen.value) close()
  else open()
}

function choose(value: string) {
  emit('update:modelValue', value)
  close(true)
}

function scrollActiveIntoView() {
  const item = list.value?.children[activeIndex.value] as HTMLElement | undefined
  item?.scrollIntoView({ block: 'nearest' })
}

function moveActive(delta: number) {
  const count = props.options.length
  if (!count) return
  activeIndex.value = (activeIndex.value + delta + count) % count
  scrollActiveIntoView()
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
    event.preventDefault()
    open()
  }
}

function onListKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveActive(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveActive(-1)
      break
    case 'Home':
      event.preventDefault()
      activeIndex.value = 0
      scrollActiveIntoView()
      break
    case 'End':
      event.preventDefault()
      activeIndex.value = props.options.length - 1
      scrollActiveIntoView()
      break
    case 'Enter':
    case ' ': {
      event.preventDefault()
      const option = props.options[activeIndex.value]
      if (option) choose(option.value)
      break
    }
    case 'Escape':
      event.preventDefault()
      close(true)
      break
    case 'Tab':
      close()
      break
  }
}

// Close when focus (or a click) leaves the component.
function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (!next || !root.value?.contains(next)) close()
}
</script>

<style scoped>
.select-menu {
  position: relative;
  width: 10rem;
}

.select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border: var(--border-width) solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-ink);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out);

  &:hover {
    background: var(--color-hover);
  }

  &:focus-visible,
  &.select-trigger--open {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.15);
  }
}

.select-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-chevron {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  color: var(--color-muted);
  transition: transform var(--duration-fast) var(--ease-out);

  .select-trigger--open & {
    transform: rotate(180deg);
  }
}

.select-list {
  position: absolute;
  top: calc(100% + var(--space-1));
  left: 0;
  right: 0;
  z-index: 50;
  margin: 0;
  padding: var(--space-1);
  list-style: none;
  max-height: 14rem;
  overflow-y: auto;
  border-radius: var(--radius-sm);
  border: var(--border-width) solid var(--color-border-strong);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);

  &:focus {
    outline: none;
  }
}

.select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: 0.8333rem;
  color: var(--color-ink-2);
  cursor: pointer;
  user-select: none;
}

.select-option-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-option--active {
  background: var(--color-primary-50);
}

.select-option--selected {
  color: var(--color-primary);
  font-weight: 600;
}

.select-pop-enter-active,
.select-pop-leave-active {
  transition:
    opacity var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out);
}

.select-pop-enter-from,
.select-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
