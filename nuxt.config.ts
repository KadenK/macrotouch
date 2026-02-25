// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  postcss: {
    plugins: {
      'postcss-nested': {},
    },
  },

  modules: ['@pinia/nuxt', '@nuxt/eslint'],

  // Disable SSR — Electron renders client-side only
  ssr: false,

  // Use hash router so file:// URLs work in production builds
  router: {
    options: {
      hashMode: process.env.NUXT_HASH_ROUTER === 'true',
    },
  },
})
