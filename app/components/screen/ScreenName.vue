<template>
  <div class="screen-name">
    <UnderlineInput
      v-if="editing"
      ref="input"
      v-model="draft"
      class="name-input"
      aria-label="Screen name"
      @keydown.enter.prevent="commit"
      @keydown.esc.prevent="editing = false"
      @blur="commit"
    />
    <button v-else type="button" class="name-button" title="Click to rename" @click="start">
      <span class="name-text">{{ name }}</span>
      <Icon class="name-edit-icon" name="mdi:edit" size="18px" />
    </button>
  </div>
</template>

<script lang="ts" setup>
import { nextTick, ref } from 'vue'
import UnderlineInput from '~/components/ui/UnderlineInput.vue'

const props = defineProps<{
  name: string
}>()

const emit = defineEmits<{
  rename: [name: string]
}>()

const editing = ref(false)
const draft = ref('')
const input = ref<InstanceType<typeof UnderlineInput> | null>(null)

async function start() {
  draft.value = props.name
  editing.value = true
  await nextTick()
  input.value?.select()
}

function commit() {
  if (!editing.value) return
  editing.value = false
  const name = String(draft.value).trim()
  if (name && name !== props.name) emit('rename', name)
}
</script>

<style scoped>
.screen-name {
  min-width: 0;
  max-width: 100%;
  margin-bottom: -6px;
}

.name-button,
.name-input {
  max-width: min(20rem, 100%);
  font-size: 20px;
  font-weight: 600;
}

.name-button {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0;
  border: 0;
  /* The underline is a 2px box-shadow strip below the box, so it never shifts the text off center. */
  box-shadow: 0 2px 0 0 transparent;
  background: transparent;
  color: var(--color-ink);
  font-family: inherit;
  line-height: normal;
  text-align: left;
  cursor: text;
  outline: none;

  &:hover {
    box-shadow: 0 2px 0 0 var(--color-border-strong);
  }

  &:focus-visible {
    box-shadow: 0 2px 0 0 var(--color-primary);
  }

  &:hover .name-edit-icon,
  &:focus-visible .name-edit-icon {
    color: var(--color-ink-2);
  }
}

.name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name-edit-icon {
  flex-shrink: 0;
  color: var(--color-muted);
  transition: color 0.1s ease;
}

/* Starts at 10rem and grows with the text. */
.name-input {
  display: block;
  width: auto;
  min-width: 10rem;
  field-sizing: content;
}
</style>
