<template>
  <div class="screen-page">
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
let toastTimeout: ReturnType<typeof setTimeout> | null = null
let removeFullscreenChangeListener: (() => void) | null = null

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
            currentScreenId.value = screenList.value[0].id
          }
        }
      },
    )
  } else if (screenList.value.length) {
    currentScreenId.value = screenList.value[0].id
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
    currentScreenId.value = list[0].id
  }
})
</script>

<style scoped>
.screen-page {
  width: 100%;
  height: 100%;
  max-width: 100%;
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
