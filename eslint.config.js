import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import prettierConfig from 'eslint-config-prettier'
import vueTs from '@vue/eslint-config-typescript'

export default [
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  ...vueTs(),
  prettierConfig,
  {
    ignores: ['dist/**', 'node_modules/**', 'uploads/**'],
  },
]
