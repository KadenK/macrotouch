import { HTTP_PORT, WEBSOCKET_PORT } from './shared/websocket'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/theme.css'],

  app: {
    head: {
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/_nuxt/assets/icons/logo.svg' }],
    },
  },

  postcss: {
    plugins: {
      'postcss-nested': {},
    },
  },

  components: [
    {
      path: '~/components',
      pathPrefix: false,
    },
  ],

  modules: ['@pinia/nuxt', '@nuxt/eslint', '@nuxt/icon'],

  // Disable SSR — Electron renders client-side only
  ssr: false,

  // Where the web apps find the master server. An empty host means the host
  // that served the page.
  runtimeConfig: {
    public: {
      masterHost: process.env.MASTER_HOST || '',
      masterHttpPort: Number(process.env.MASTER_HTTP_PORT || HTTP_PORT),
      websocketPort: Number(process.env.WS_PORT || WEBSOCKET_PORT),
    },
  },

  // Dev server for UI work only; the master server is a separate process.
  devServer: {
    host: '0.0.0.0',
    port: 4321,
  },

  icon: {
    customCollections: [
      {
        prefix: 'mt',
        dir: './app/assets/icons',
      },
    ],
  },
})
