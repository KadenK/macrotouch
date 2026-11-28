<template>
  <Modal v-model="isOpen" title="Crop image">
    <div class="crop-body">
      <!-- The image seen through the frame; drag to move, wheel / pinch / slider to zoom. -->
      <div class="editor">
        <div class="chips chips--stack" role="radiogroup" aria-label="Image style">
          <button
            v-for="m in MODES"
            :key="m.value"
            type="button"
            role="radio"
            :aria-checked="mode === m.value"
            :class="['chip', { 'chip--on': mode === m.value }]"
            @click="mode = m.value"
          >
            {{ m.label }}
          </button>
        </div>
        <!-- The macro itself: its colors, shape and rounded corners, with the image placed on it. -->
        <div
          ref="frame"
          class="frame"
          :style="{ width: `${frameW}px`, height: `${frameH}px`, background: backgroundColor }"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @wheel.prevent="onWheel"
        >
          <div :class="['viewport', { 'viewport--inset': mode === 'inset' }]" :style="viewportStyle">
            <img
              v-if="src"
              :src="src"
              class="frame-img"
              crossorigin="anonymous"
              draggable="false"
              :style="imgStyle"
              alt=""
              @load="onLoad"
            />
          </div>
          <div v-if="!loaded && !loadError" class="frame-note">Loading…</div>
          <div v-if="loadError" class="frame-note">The image could not be loaded.</div>
        </div>
        <input
          v-model.number="zoom"
          class="zoom"
          type="range"
          min="1"
          :max="MAX_ZOOM"
          step="0.01"
          aria-label="Zoom"
          :style="{ height: `${frameH}px` }"
          :disabled="!loaded"
        />
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <div class="actions">
        <button type="button" class="btn" :disabled="busy" @click="isOpen = false">Cancel</button>
        <button type="button" class="btn btn--primary" :disabled="busy || !loaded" @click="confirm">
          {{ busy ? 'Saving…' : 'Done' }}
        </button>
      </div>
    </template>
  </Modal>
</template>

<script lang="ts" setup>
import Modal from '~/components/ui/Modal.vue'
import { bakeMacroImage, cropRegion, originalImageSrc } from '~/composables/useMacroImage'
import type { IconImage, MacroSpan } from '~/../shared/types/macro'

/**
 * Crop an uploaded image for a macro shape.
 *
 * The crop is what `IconImage.crop` says (see `cropRegion`): the frame has the
 * aspect of the span; at zoom 1 it is the largest such rectangle inside the
 * image; the visible region is that / zoom, centred on (x, y) in 0..1 of the
 * original. The frame is drawn from the same numbers, so it matches
 * what the master bakes. Works on the original, so Edit needs no re-upload.
 */
const props = defineProps<{
  /** Image id on the master. */
  imageId: string
  /** The macro's span: the crop frame always has its shape. */
  defaultSpan?: MacroSpan
  /** Existing settings when editing. */
  initial?: IconImage
  backgroundColor: string
}>()
const emit = defineEmits<{ confirm: [image: IconImage] }>()
const isOpen = defineModel<boolean>({ required: true })

const MAX_ZOOM = 8
const MODES = [
  { value: 'fill', label: 'Fill' },
  { value: 'inset', label: 'Inset' },
] as const

const cx = ref(0.5)
const cy = ref(0.5)
const zoom = ref(1)
const mode = ref<IconImage['mode']>('fill')
const natural = ref({ w: 1, h: 1 })
const loaded = ref(false)
const loadError = ref(false)
const busy = ref(false)
const error = ref('')

// Start from the saved crop, or the macro's shape, each time it opens.
watch(
  isOpen,
  (open) => {
    if (!open) return
    cx.value = props.initial?.crop.x ?? 0.5
    cy.value = props.initial?.crop.y ?? 0.5
    zoom.value = props.initial?.crop.zoom ?? 1
    mode.value = props.initial?.mode ?? 'fill'
    loaded.value = false
    loadError.value = false
    error.value = ''
    busy.value = false
  },
  { immediate: true },
)

// The frame is always the macro's own shape.
const span = computed<MacroSpan>(() => props.defaultSpan ?? props.initial?.span ?? { rows: 1, columns: 1 })

/** Whether a noticeable part of the image is transparent, judged on a small copy. */
function hasTransparency(img: HTMLImageElement): boolean {
  try {
    const edge = 64
    const k = Math.min(1, edge / Math.max(img.naturalWidth || edge, img.naturalHeight || edge))
    const w = Math.max(1, Math.round((img.naturalWidth || edge) * k))
    const h = Math.max(1, Math.round((img.naturalHeight || edge) * k))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(img, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h).data
    let clear = 0
    for (let i = 3; i < data.length; i += 4) if (data[i]! < 250) clear++
    return clear / (w * h) > 0.02
  } catch {
    // A tainted canvas (no CORS) or an unreadable image: treat it as opaque.
    return false
  }
}

const src = computed(() => (isOpen.value ? originalImageSrc(props.imageId) : ''))

function onLoad(event: Event) {
  const img = event.target as HTMLImageElement
  // An SVG with no intrinsic size reports 0.
  natural.value = { w: img.naturalWidth || 512, h: img.naturalHeight || 512 }
  loaded.value = true
  // A new image defaults to what suits it: transparent ones sit inset like an icon, opaque ones fill.
  if (!props.initial) mode.value = hasTransparency(img) ? 'inset' : 'fill'
}

// Frame display size: the span's aspect, fitted in a box.
const BOX_W = 320
const BOX_H = 280
const aspect = computed(() => span.value.columns / span.value.rows)
const frameW = computed(() => Math.round(Math.min(BOX_W, BOX_H * aspect.value)))
const frameH = computed(() => Math.round(frameW.value / aspect.value))

const region = computed(() =>
  cropRegion(natural.value.w, natural.value.h, span.value, { x: cx.value, y: cy.value, zoom: zoom.value }),
)
/**
 * The part of the macro the image fills: all of it for `fill`, the inner 75%
 * (like an icon glyph) for `inset`. The crop region is shown through it.
 */
const fit = computed(() => (mode.value === 'inset' ? 0.75 : 1))
const viewW = computed(() => frameW.value * fit.value)
const viewH = computed(() => frameH.value * fit.value)
const viewportStyle = computed(() => ({ width: `${viewW.value}px`, height: `${viewH.value}px` }))
/** Display pixels per original pixel. */
const scale = computed(() => viewW.value / region.value.width)

const imgStyle = computed(() => {
  const s = scale.value
  const { w, h } = natural.value
  return {
    width: `${w * s}px`,
    height: `${h * s}px`,
    left: `${viewW.value / 2 - region.value.x * w * s}px`,
    top: `${viewH.value / 2 - region.value.y * h * s}px`,
    visibility: loaded.value ? 'visible' : 'hidden',
  } as const
})

// Keep the stored centre inside the image when the zoom or shape changes.
watch([zoom, span], () => {
  cx.value = region.value.x
  cy.value = region.value.y
})

// Pointer: one finger / mouse pans, two fingers pinch.
const pointers = new Map<number, { x: number; y: number }>()
let pinchStart: { dist: number; zoom: number } | undefined

function onPointerDown(event: PointerEvent) {
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
    pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: zoom.value }
  }
}

function onPointerMove(event: PointerEvent) {
  const last = pointers.get(event.pointerId)
  if (!last || !loaded.value) return
  const next = { x: event.clientX, y: event.clientY }
  pointers.set(event.pointerId, next)
  if (pointers.size >= 2 && pinchStart) {
    const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    zoom.value = Math.min(MAX_ZOOM, Math.max(1, (pinchStart.zoom * dist) / pinchStart.dist))
    return
  }
  const { w, h } = natural.value
  const s = scale.value
  const next2 = cropRegion(w, h, span.value, {
    x: region.value.x - (next.x - last.x) / s / w,
    y: region.value.y - (next.y - last.y) / s / h,
    zoom: zoom.value,
  })
  cx.value = next2.x
  cy.value = next2.y
}

function onPointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinchStart = undefined
}

function onWheel(event: WheelEvent) {
  zoom.value = Math.min(MAX_ZOOM, Math.max(1, zoom.value * Math.exp(-event.deltaY * 0.002)))
}

async function confirm() {
  busy.value = true
  error.value = ''
  try {
    const crop = { x: region.value.x, y: region.value.y, zoom: region.value.zoom }
    const image = await bakeMacroImage(props.imageId, span.value, crop, mode.value)
    emit('confirm', image)
    isOpen.value = false
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'The image could not be saved.'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped lang="postcss">
.crop-body {
  padding: 0 1.5rem 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.field {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.field-label {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--color-text-strong);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.chips--stack {
  margin-right: 0.75rem;
  flex-direction: column;
  flex-wrap: nowrap;
  align-self: center;
}

.chip {
  min-height: 36px;
  padding: 0 0.75rem;
  border: var(--border-width) solid var(--color-input-border);
  border-radius: 4px;
  background: var(--color-neutral);
  color: var(--color-text-strong);
  font-size: 0.875rem;
  cursor: pointer;
}

.chip--on {
  border-color: var(--color-text-strong);
  font-weight: 600;
}

.frame {
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
  border: 2px solid var(--color-text-strong);
  border-radius: 8px;
  /* Dragging pans the image instead of scrolling the page. */
  touch-action: none;
  cursor: grab;
  user-select: none;
}

.frame-img {
  position: absolute;
  max-width: none;
  pointer-events: none;
  user-select: none;
}

.frame-note {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-faint);
  font-size: 0.875rem;
  text-align: center;
}

.editor {
  display: flex;
  align-items: stretch;
  gap: 1.5rem;
}

/* A vertical slider on the frame's right edge, maximum at the top. */
.zoom {
  width: 28px;
  writing-mode: vertical-lr;
  direction: rtl;
  margin: 0;
}

/* The image's area on the macro; inset shows its edge so the margin reads as the icon margin. */
.viewport {
  position: absolute;
  top: 50%;
  left: 50%;
  overflow: hidden;
  transform: translate(-50%, -50%);
}

.viewport--inset {
  border-radius: 8px;
  outline: 1px dashed var(--color-text-faint);
}

.error {
  margin: 0;
  width: 100%;
  color: var(--color-danger);
  font-size: 0.875rem;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.btn {
  min-height: 36px;
  padding: 0 1rem;
  border: none;
  border-radius: 4px;
  background: var(--color-neutral);
  color: var(--color-text-strong);
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.btn--primary {
  background: var(--color-primary);
  color: #fff;
}
</style>
