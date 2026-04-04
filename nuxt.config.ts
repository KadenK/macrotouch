import { WEBSOCKET_PORT } from './shared/websocket'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
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

  // Use hash router so file:// URLs work in production builds
  router: {
    options: {
      hashMode: process.env.NUXT_HASH_ROUTER === 'true',
    },
  },

  // Runtime config for websocket port (customize with WS_PORT)
  runtimeConfig: {
    public: {
      websocketPort: Number(process.env.WS_PORT || WEBSOCKET_PORT),
    },
  },

  // Prevent Electron runtime dependencies from being traced into Nuxt/Nitro builds on macOS
  nitro: {
    externals: {
      external: ['electron'],
      traceOptions: {
        ignore: (path: string) => path.includes('/node_modules/electron/'),
      },
    },
  },

  // Bind dev server to all interfaces for network access and use port 4321
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
