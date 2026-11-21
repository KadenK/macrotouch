<template>
  <div class="picker">
    <button
      ref="trigger"
      type="button"
      class="trigger"
      :class="{ stale: modelValue && !selected }"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? listId : undefined"
      @click="open ? close() : openPicker()"
      @keydown="onTriggerKeydown"
    >
      <Icon v-if="selected?.action.icon" :name="selected.action.icon" class="icon" />
      <span class="trigger-text">
        <span>{{
          selected ? selected.action.label : modelValue ? `${modelValue} — Action unavailable` : '(None)'
        }}</span>
        <span v-if="selected" class="secondary"
          >{{ selected.group.label
          }}<template v-if="selected.action.group"> · {{ selected.action.group }}</template></span
        >
      </span>
      <span aria-hidden="true" class="chevron">▾</span>
    </button>

    <Teleport to="body">
      <div v-if="open" ref="panel" class="panel" :style="panelStyle">
        <input
          ref="searchInput"
          v-model="query"
          class="search"
          type="text"
          placeholder="Search actions"
          aria-label="Search actions"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          :aria-controls="listId"
          :aria-activedescendant="activeId"
          @keydown="onListKeydown"
        />
        <div :id="listId" class="list" role="listbox" aria-label="Actions">
          <div
            :id="optionId('')"
            class="option"
            :class="{ highlighted: highlight === '' }"
            role="option"
            :aria-selected="modelValue === ''"
            @mousemove="highlight = ''"
            @click="select('')"
          >
            (None)
          </div>
          <template v-for="group in filteredGroups" :key="group.source.id">
            <div class="group-header">
              <Icon v-if="group.source.icon" :name="group.source.icon" class="icon" />
              <span>{{ group.source.label }}</span>
              <span v-if="!isSelectable(group.source.availability)" class="group-message">{{
                group.source.availability?.message
              }}</span>
            </div>
            <div
              v-if="
                !group.source.actions.length &&
                (isSelectable(group.source.availability) || !group.source.availability?.message)
              "
              class="empty-row"
            >
              No actions
            </div>
            <template v-for="section in group.sections" :key="section.name">
              <div v-if="section.name" class="section-heading">{{ section.name }}</div>
              <ActionPickerOption
                v-for="action in section.actions"
                :id="optionId(action.actionId)"
                :key="action.actionId"
                :action="action"
                :group="group.source"
                :nested="!!section.name"
                :highlighted="highlight === action.actionId"
                :selected="modelValue === action.actionId"
                @highlight="highlight = action.actionId"
                @select="select(action.actionId)"
              />
            </template>
          </template>
          <div v-if="query.trim() && !matchingCount" class="empty-row">No matching actions</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { ActionGroup } from '~/../shared/types/node'
import { actionSelectable, isSelectable } from '~/../shared/types/plugin'
import ActionPickerOption from './ActionPickerOption.vue'

const props = defineProps<{ modelValue: string; groups: ActionGroup[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const open = ref(false)
const query = ref('')
const highlight = ref('')
const panelStyle = ref<Record<string, string>>({})
const listId = `action-picker-${useId()}`
const optionId = (id: string) => `${listId}-option-${encodeURIComponent(id)}`
const activeId = computed(() => optionId(highlight.value))
const selected = computed(() => {
  for (const group of props.groups) {
    const action = group.actions.find((item) => item.actionId === props.modelValue)
    if (action) return { group, action }
  }
  return undefined
})
const filteredGroups = computed(() => {
  const term = query.value.trim().toLocaleLowerCase()
  return props.groups
    .map((source) => {
      const actions = source.actions.filter((action) =>
        [action.label, action.description, source.label, action.group].some((value) =>
          value?.toLocaleLowerCase().includes(term),
        ),
      )
      const names = [...new Set(actions.map((action) => action.group).filter((name): name is string => !!name))]
      const sections = [
        { name: '', actions: actions.filter((action) => !action.group) },
        ...names.map((name) => ({ name, actions: actions.filter((action) => action.group === name) })),
      ]
      return { source, sections, count: actions.length }
    })
    .filter((group) => group.count || (!term && !group.source.actions.length))
})
const matchingCount = computed(() => filteredGroups.value.reduce((count, group) => count + group.count, 0))
const selectableIds = computed(() => [
  '',
  ...filteredGroups.value.flatMap(({ source, sections }) =>
    sections.flatMap((section) =>
      section.actions.filter((action) => actionSelectable(source, action)).map((action) => action.actionId),
    ),
  ),
])

function positionPanel() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return
  const availableBelow = Math.max(80, window.innerHeight - rect.bottom - 8)
  panelStyle.value = {
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    maxHeight: `${availableBelow}px`,
  }
}
async function openPicker(initial = '') {
  query.value = initial
  open.value = true
  positionPanel()
  highlight.value = selectableIds.value.includes(props.modelValue) ? props.modelValue : ''
  await nextTick()
  searchInput.value?.focus()
  scrollHighlight()
}
function close(restoreFocus = false) {
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}
function select(id: string) {
  emit('update:modelValue', id)
  close(true)
}
function scrollHighlight() {
  document.getElementById(optionId(highlight.value))?.scrollIntoView({ block: 'nearest' })
}
watch(selectableIds, (ids) => {
  if (!ids.includes(highlight.value)) highlight.value = ''
})
watch(highlight, () => nextTick(scrollHighlight))
function onListKeydown(event: KeyboardEvent) {
  const ids = selectableIds.value
  const index = ids.indexOf(highlight.value)
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close(true)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    select(highlight.value)
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? ids.length - 1
          : event.key === 'ArrowDown'
            ? Math.min(index + 1, ids.length - 1)
            : Math.max(index - 1, 0)
    highlight.value = ids[next] ?? ''
  }
}
function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    openPicker()
    return
  }
  if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    openPicker(event.key)
  }
}
function onPointerDown(event: PointerEvent) {
  if (open.value && !trigger.value?.contains(event.target as Node) && !panel.value?.contains(event.target as Node))
    close()
}
if (import.meta.client) {
  document.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('resize', positionPanel)
  window.addEventListener('scroll', positionPanel, true)
}
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('resize', positionPanel)
  window.removeEventListener('scroll', positionPanel, true)
})
</script>

<style scoped>
.trigger {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: var(--border-width) solid var(--color-input-border);
  border-radius: var(--radius-sm);
  background: var(--color-input-bg);
  color: var(--color-text-strong);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}
.trigger:focus-visible,
.search:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}
.trigger.stale {
  color: var(--color-danger);
}
.trigger-text {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}
.secondary {
  color: var(--color-text-faint);
  font-size: var(--text-xs);
}
.chevron {
  color: var(--color-text-subtle);
}
.icon {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
}
.panel {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: var(--space-2);
  border: var(--border-width) solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}
.search {
  box-sizing: border-box;
  width: 100%;
  padding: var(--space-2);
  border: var(--border-width) solid var(--color-input-border);
  border-radius: var(--radius-sm);
  background: var(--color-input-bg);
  color: var(--color-text-strong);
  font-size: var(--text-sm);
}
.list {
  overflow-y: auto;
  max-height: 22rem;
  min-height: 0;
  margin-top: var(--space-2);
}
.group-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-2) var(--space-1);
  border-top: var(--border-width) solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-faint);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.group-header .icon {
  width: 0.9rem;
  height: 0.9rem;
}
.group-message {
  margin-left: auto;
  letter-spacing: normal;
  text-transform: none;
  color: var(--color-text-faint);
  font-size: var(--text-xs);
  font-weight: 400;
}
.section-heading {
  padding: var(--space-2) var(--space-2) var(--space-1) var(--space-5);
  color: var(--color-text-subtle);
  font-size: var(--text-xs);
  font-weight: 600;
}
.option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--color-text-strong);
  font-size: var(--text-sm);
  cursor: pointer;
}
.option.highlighted {
  background: var(--color-primary-50);
}
.empty-row {
  padding: var(--space-2);
  color: var(--color-text-faint);
  font-size: var(--text-sm);
}
</style>
