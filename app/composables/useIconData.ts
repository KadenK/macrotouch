import { ref } from 'vue'
import { icons as icData } from '@iconify-json/ic'

const icons = ref<string[]>([])
const isLoaded = ref(false)

export const useIconData = () => {
  const loadIcons = () => {
    if (isLoaded.value) return

    const iconList: string[] = []

    // icData is an IconifyJSON object with structure:
    // { prefix, icons: {...}, aliases: {...}, ... }
    Object.keys(icData.icons).forEach((iconName) => {
      iconList.push(iconName)
    })

    icons.value = iconList
    isLoaded.value = true
  }

  const searchIcons = (query: string) => {
    if (!query.trim()) return icons.value

    const lowerQuery = query.toLowerCase()
    return icons.value.filter((iconName) => iconName.toLowerCase().includes(lowerQuery))
  }

  return {
    icons,
    isLoaded,
    loadIcons,
    searchIcons,
  }
}
