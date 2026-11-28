<template>
  <div class="icon-row">
    <button type="button" class="icon-preview" :style="{ background: backgroundColor }" @click="isPickerOpen = true">
      <Icon
        v-if="icon.source === 'LIBRARY'"
        :name="normalizeIconValue(icon.value)"
        class="preview-icon"
        :style="{ color: iconColor }"
      />
      <img
        v-else-if="imageSrc"
        :src="imageSrc"
        class="preview-image"
        :class="{ 'preview-image--fill': icon.image?.mode === 'fill' }"
        draggable="false"
        alt=""
      />
      <span v-else class="preview-placeholder">?</span>
    </button>
    <div class="icon-actions">
      <template v-if="icon.source === 'IMAGE'">
        <button type="button" class="small-btn" @click="editImage">Edit</button>
        <button type="button" class="small-btn" @click="chooseFile">Replace</button>
        <button type="button" class="small-btn" @click="removeImage">Remove</button>
      </template>
      <template v-else>
        <button v-if="withButton" type="button" class="small-btn" @click="isPickerOpen = true">Choose Icon</button>
        <button type="button" class="small-btn" :disabled="uploading" @click="chooseFile">
          {{ uploading ? 'Uploading…' : 'Choose Image' }}
        </button>
      </template>
    </div>
    <input ref="fileInput" type="file" class="file-input" :accept="ACCEPT" @change="onFile" />
  </div>
  <p v-if="error" class="upload-error" role="alert">{{ error }}</p>

  <IconPickerModal v-model="isPickerOpen" @select="select" />
  <ImageCropModal
    v-if="cropId"
    v-model="isCropOpen"
    :image-id="cropId"
    :initial="cropInitial"
    :default-span="span"
    :background-color="backgroundColor"
    @confirm="onCropped"
  />
</template>

<script lang="ts" setup>
import IconPickerModal from '~/components/iconPicker/IconPickerModal.vue'
import ImageCropModal from '~/components/macro/ImageCropModal.vue'
import { normalizeIconValue } from '~/composables/useIconData'
import { macroImageSrc, uploadMacroImage } from '~/composables/useMacroImage'
import type { Icon } from '~/../shared/types'
import { IMAGE_LIMITS, IconSource, type IconImage, type MacroSpan } from '~/../shared/types/macro'

/**
 * An icon drawn in its colors. Clicking it opens the icon picker. Beside it,
 * the icon can become an uploaded image (cropped for the macro's shape), then
 * be edited, replaced or removed.
 */
defineProps<{
  iconColor: string
  backgroundColor: string
  /** Also show a "Choose Icon" button beside it. */
  withButton?: boolean
  /** The macro's shape, which a new crop starts from. */
  span?: MacroSpan
}>()

const ACCEPT = IMAGE_LIMITS.mimeTypes.join(',')
const icon = defineModel<Icon>({ required: true })
const isPickerOpen = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const error = ref('')
const isCropOpen = ref(false)
const cropId = ref('')
const cropInitial = ref<IconImage | undefined>()
/** The library icon to go back to on Remove. */
let lastLibrary: Icon | undefined = icon.value.source === IconSource.Library ? icon.value : undefined

const imageSrc = computed(() => macroImageSrc(icon.value))

function select(iconName: string) {
  icon.value = lastLibrary = { source: IconSource.Library, value: iconName }
  isPickerOpen.value = false
}

function chooseFile() {
  error.value = ''
  fileInput.value?.click()
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  error.value = ''
  uploading.value = true
  try {
    const uploaded = await uploadMacroImage(file)
    cropId.value = uploaded.id
    cropInitial.value = undefined
    await nextTick()
    isCropOpen.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'The image could not be uploaded.'
  } finally {
    uploading.value = false
  }
}

function editImage() {
  if (icon.value.source !== IconSource.Image || !icon.value.image) return
  cropId.value = icon.value.value
  cropInitial.value = icon.value.image
  isCropOpen.value = true
}

function onCropped(image: IconImage) {
  if (icon.value.source === IconSource.Library) lastLibrary = icon.value
  icon.value = { source: IconSource.Image, value: cropId.value, image }
}

function removeImage() {
  icon.value = lastLibrary ?? { source: IconSource.Library, value: 'ic:baseline-home' }
}
</script>

<style scoped lang="postcss">
.icon-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.small-btn {
  padding: 0.5rem;
  width: 96px;
  min-height: 32px;
  background-color: var(--color-neutral);
  color: var(--color-text-strong);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  text-align: center;
  line-height: 1.2;
}

.icon-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.file-input {
  display: none;
}

.upload-error {
  margin: 0.25rem 0 0;
  color: var(--color-danger);
  font-size: 0.75rem;
}

.preview-image {
  width: 75%;
  height: 75%;
  object-fit: contain;
  pointer-events: none;
}

.preview-image--fill {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.icon-preview {
  overflow: hidden;
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  padding: 0;
  border: var(--border-width) solid var(--color-input-border);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.preview-icon {
  width: 48px;
  height: 48px;
  font-size: 48px;
}

.preview-placeholder {
  font-size: 24px;
  color: var(--color-text-faint);
}
</style>
