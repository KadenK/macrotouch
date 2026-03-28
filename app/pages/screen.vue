<template>
  <div
    class="screen-page"
    @pointerdown="onSwipeStart"
    @pointermove="onSwipeMove"
    @pointerup="onSwipeEnd"
    @touchstart="onSwipeStart"
    @touchmove="onSwipeMove"
    @touchend="onSwipeEnd"
    @click.capture="onCaptureClick"
  >
    <Screen v-if="currentScreenId" :screen-id="currentScreenId" :editable="false" />
    <div v-else class="empty-state">No screens available.</div>

    <transition name="toast-fade">
      <div v-if="toastMessage" class="toast">{{ toastMessage }}</div>
    </transition>

    <div
      v-if="showFullscreenHint"
      class="fullscreen-hint"
      @pointerdown="onFullscreenHintGesture"
      @touchstart="onFullscreenHintGesture"
      @click="onFullscreenHintGesture"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMacroStore } from '~/stores/macro'
import Screen from '~/components/screen/screen.vue'

definePageMeta({
  layout: 'screen',
})

const store = useMacroStore()

const currentScreenId = ref('')
const screenList = computed(() => store.getScreenList())

const toastMessage = ref('')
const showFullscreenHint = ref(false)
let toastTimeout: number | null = null
let removeFullscreenChangeListener: (() => void) | null = null

let swipeStartX = 0
let swipeStartY = 0
let swipeStartTime = 0
const isSwiping = ref(false)

const showToast = (message: string, duration = 3000) => {
  toastMessage.value = message
  if (toastTimeout) {
    clearTimeout(toastTimeout)
  }
  toastTimeout = window.setTimeout(() => {
    toastMessage.value = ''
    toastTimeout = null
  }, duration)
}

const hideFullscreenHint = () => {
  showFullscreenHint.value = false
}

const cycleScreen = (direction: 1 | -1) => {
  if (!screenList.value.length) return
  if (!currentScreenId.value) {
    currentScreenId.value = screenList.value[0]?.id ?? ''
    return
  }

  const currentIndex = screenList.value.findIndex((s) => s.id === currentScreenId.value)
  if (currentIndex === -1) {
    currentScreenId.value = screenList.value[0]?.id ?? ''
    return
  }

  const nextIndex = (currentIndex + direction + screenList.value.length) % screenList.value.length
  const nextScreen = screenList.value[nextIndex]
  if (!nextScreen) return

  currentScreenId.value = nextScreen.id
  showToast(`Screen: ${nextScreen.name}`, 1000)
}

const onSwipeStart = (event: TouchEvent | PointerEvent) => {
  if (event instanceof TouchEvent) {
    if (!event.touches.length) return
    const touch = event.touches[0]
    if (!touch) return
    swipeStartX = touch.clientX
    swipeStartY = touch.clientY
  } else {
    swipeStartX = event.clientX
    swipeStartY = event.clientY
  }
  swipeStartTime = Date.now()
}

const onSwipeMove = (event: TouchEvent | PointerEvent) => {
  let moveX = 0
  let moveY = 0

  if (event instanceof TouchEvent) {
    if (!event.touches.length) return
    const touch = event.touches[0]
    if (!touch) return
    moveX = touch.clientX
    moveY = touch.clientY
  } else {
    moveX = event.clientX
    moveY = event.clientY
  }

  const deltaX = moveX - swipeStartX
  const deltaY = moveY - swipeStartY

  if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
    isSwiping.value = true
  }
}

const onSwipeEnd = (event: TouchEvent | PointerEvent) => {
  if (swipeStartTime === 0) return

  let endX = 0
  let endY = 0

  if (event instanceof TouchEvent) {
    if (!event.changedTouches.length) return
    const touch = event.changedTouches[0]
    if (!touch) return
    endX = touch.clientX
    endY = touch.clientY
  } else {
    endX = event.clientX
    endY = event.clientY
  }

  const deltaX = endX - swipeStartX
  const deltaY = endY - swipeStartY
  const deltaTime = Date.now() - swipeStartTime

  swipeStartTime = 0

  if (deltaTime > 600) return
  if (Math.abs(deltaX) < 60) return
  if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.5) return

  if (deltaX < 0) {
    // Swipe left => next screen
    cycleScreen(1)
  } else {
    // Swipe right => previous screen
    cycleScreen(-1)
  }

  // keep swipe block through this click/touch chain to avoid accidental macro activation
  setTimeout(() => {
    isSwiping.value = false
  }, 0)
}

const onCaptureClick = (event: MouseEvent) => {
  if (isSwiping.value) {
    event.preventDefault()
    event.stopImmediatePropagation()
    isSwiping.value = false
  }
}

const onFullscreenHintGesture = async () => {
  const entered = await tryEnterFullscreen()
  if (entered) {
    toastMessage.value = ''
    hideFullscreenHint()
  }
}

const tryEnterFullscreen = async () => {
  if (!('fullscreenEnabled' in document) || !document.fullscreenEnabled) {
    return false
  }

  if (document.fullscreenElement) {
    return true
  }

  const request = async (el: Element) => {
    try {
      // Some browsers (e.g., Android Chrome) have better support when requesting fullscreen
      // on the <body> element rather than <html>.
      await (el as any).requestFullscreen?.({ navigationUI: 'hide' })
      return true
    } catch (e) {
      return false
    }
  }

  if (await request(document.documentElement)) {
    return true
  }

  if (await request(document.body)) {
    return true
  }

  return false
}

const requestFullscreenOnGesture = () => {
  if (!('fullscreenEnabled' in document) || !document.fullscreenEnabled) {
    return
  }

  showFullscreenHint.value = true
  showToast('Tap anywhere to enter fullscreen')

  // Keep listeners as a backup in case the overlay doesn't capture the gesture.
  const onUserGesture = async () => {
    const entered = await tryEnterFullscreen()
    if (entered) {
      toastMessage.value = ''
      hideFullscreenHint()
      document.removeEventListener('pointerdown', onUserGesture, { capture: true })
      document.removeEventListener('touchstart', onUserGesture, { capture: true })
      document.removeEventListener('click', onUserGesture, { capture: true })
    }
  }

  document.addEventListener('pointerdown', onUserGesture, { once: true, capture: true })
  document.addEventListener('touchstart', onUserGesture, { once: true, capture: true })
  document.addEventListener('click', onUserGesture, { once: true, capture: true })
}

onMounted(() => {
  if (!store.isReady) {
    const stop = watch(
      () => store.isReady,
      (ready) => {
        if (ready) {
          stop()
          if (screenList.value.length) {
            currentScreenId.value = screenList.value[0]?.id ?? ''
          }
        }
      },
    )
  } else if (screenList.value.length) {
    currentScreenId.value = screenList.value[0]?.id ?? ''
  }

  const onFullscreenChange = () => {
    if (document.fullscreenElement) {
      hideFullscreenHint()
      toastMessage.value = ''
    }
  }

  document.addEventListener('fullscreenchange', onFullscreenChange)
  removeFullscreenChangeListener = () => {
    document.removeEventListener('fullscreenchange', onFullscreenChange)
  }

  tryEnterFullscreen().then((entered) => {
    if (!entered) {
      requestFullscreenOnGesture()
    }
  })
})

onBeforeUnmount(() => {
  removeFullscreenChangeListener?.()
})

watch(screenList, (list) => {
  if (!currentScreenId.value && list.length) {
    currentScreenId.value = list[0]?.id ?? ''
  }
})
</script>

<style scoped>
.screen-page {
  width: 100%;
  height: 100%;
  max-width: 100%;
  touch-action: pan-y;
  max-height: 100%;
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.empty-state {
  color: #6b7280;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 1.25rem;
  transform: translateX(-50%);
  max-width: 90vw;
  padding: 0.75rem 1.1rem;
  background: rgba(33, 33, 33, 0.9);
  color: #fff;
  border-radius: 9999px;
  font-size: 0.9rem;
  text-align: center;
  z-index: 9999;
  pointer-events: none;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 180ms ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
}

.fullscreen-hint {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: transparent;
  touch-action: manipulation;
}
</style>
