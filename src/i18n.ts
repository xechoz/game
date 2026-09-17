/**
 * 轻量 i18n（无第三方依赖）
 *
 * - 支持 zh / en，按浏览器语言自动选择
 * - 消息模板支持 {param} 占位符替换
 * - t(key, params) 在任何地方可用；组件内可用 useI18n() 拿响应式 locale
 * - 词条文件：src/locales/zh.json / en.json
 */
import { computed, reactive, type ComputedRef } from 'vue'

import enMessages from './locales/en.json'
import zhMessages from './locales/zh.json'

type Locale = 'en' | 'zh'

type MessageParams = Record<string, string | number | boolean>

type MessageCatalog = Record<string, string>

const supportedLocales = ['en', 'zh'] as const

type SupportedLocale = (typeof supportedLocales)[number]

const messages: Record<SupportedLocale, MessageCatalog> = {
  en: enMessages,
  zh: zhMessages,
}

// 根据浏览器语言偏好选择初始 locale（zh 优先，其次 en）
function getBrowserLocale(): SupportedLocale {
  if (typeof navigator === 'object' && navigator) {
    const languages = Array.isArray(navigator.languages)
      ? navigator.languages
      : [navigator.language]

    for (const raw of languages) {
      const normalized = String(raw).trim().toLowerCase()
      if (normalized.startsWith('zh')) return 'zh'
      if (normalized.startsWith('en')) return 'en'
    }
  }
  return 'en'
}

const state = reactive({ locale: getBrowserLocale() as SupportedLocale })

// 把消息模板中的 {key} 占位符替换为参数值
function replaceParams(message: string, params?: MessageParams): string {
  if (!params) return message

  return Object.entries(params).reduce((current, [key, value]) => {
    return current.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value))
  }, message)
}

// 取当前语言的词条（缺词条时回退英文，再回退 key 本身）
export function t(key: string, params?: MessageParams): string {
  const localeMessages = messages[state.locale] ?? messages.en
  const template = localeMessages[key] ?? messages.en[key] ?? key
  return replaceParams(template, params)
}

export function setLocale(localeValue: Locale): void {
  if (supportedLocales.includes(localeValue)) {
    state.locale = localeValue
  }
}

export function useI18n(): {
  locale: ComputedRef<Locale>
  setLocale: (localeValue: Locale) => void
  t: (key: string, params?: MessageParams) => string
} {
  return {
    locale: computed(() => state.locale),
    setLocale,
    t,
  }
}
