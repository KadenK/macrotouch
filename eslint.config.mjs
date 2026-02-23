// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import prettierConfig from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'

export default withNuxt(
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': [
        'error',
        {
          printWidth: 120,
          semi: false,
          tabWidth: 2,
          endOfLine: 'auto',
          singleQuote: true,
        },
      ],
    },
  },
  prettierConfig,
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.nuxt/**',
      '.output/**',
      'build/**',
      'android/app/build/**',
      'ios/App/Pods/**',
    ],
  },
).override('nuxt/vue/rules', {
  rules: {
    'vue/no-deprecated-slot-attribute': 'off', // Ionic uses its own slot system that looks like the deprecated Vue slot syntax
    'vue/multi-word-component-names': 'off', // Allow single-word component names
  },
})
