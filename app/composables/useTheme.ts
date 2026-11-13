import { computed, onScopeDispose, watchEffect } from 'vue'

export type ThemePreference = 'light' | 'dark'

const STORAGE_KEY = 'macrotouch-theme'

/**
 * Light/dark theme. Follows the system preference until the user picks one
 * with `toggle()`, after which their choice is stored and used instead.
 */
export function useTheme() {
  const preference = useState<ThemePreference | null>('theme-preference', () => null)
  const systemDark = useState<boolean>('theme-system-dark', () => false)

  const isDark = computed(() => (preference.value ?? (systemDark.value ? 'dark' : 'light')) === 'dark')

  function toggle() {
    preference.value = isDark.value ? 'light' : 'dark'
    localStorage.setItem(STORAGE_KEY, preference.value)
  }

  /** Call once from the root component to sync state with storage, the OS and <html>. */
  function init() {
    const stored = localStorage.getItem(STORAGE_KEY)
    preference.value = stored === 'light' || stored === 'dark' ? stored : null

    const query = window.matchMedia('(prefers-color-scheme: dark)')
    systemDark.value = query.matches
    const onChange = (event: MediaQueryListEvent) => (systemDark.value = event.matches)
    query.addEventListener('change', onChange)
    onScopeDispose(() => query.removeEventListener('change', onChange))

    watchEffect(() => {
      document.documentElement.dataset.theme = isDark.value ? 'dark' : 'light'
    })
  }

  return { isDark, toggle, init }
}
