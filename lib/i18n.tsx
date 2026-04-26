'use client'

import { useState, useEffect, useCallback, useContext, createContext } from 'react'
import zh from './i18n/zh'
import en from './i18n/en'
import type { TranslationKey } from './i18n/zh'

export type { TranslationKey }

export type Locale = 'zh' | 'en'

const STORAGE_KEY = 'hackagent-locale'
export const LOCALE_COOKIE = 'hackagent-locale'
const DEFAULT_LOCALE: Locale = 'zh'

const translations: Record<Locale, Record<string, string>> = { zh, en }

// ── Client-side locale read/write ─────────────────────────────────────────────

export function getLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  // Prefer DOM attribute (set by inline bootstrap script in <html>), fallback to localStorage/cookie.
  // This ensures the value is stable between first render and effect, avoiding flash on hydration.
  const fromDom = document.documentElement.getAttribute('data-locale')
  if (fromDom === 'en' || fromDom === 'zh') return fromDom
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'zh') return stored
  } catch {}
  return DEFAULT_LOCALE
}

export function setLocale(l: Locale): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORAGE_KEY, l) } catch {}
  // Persist to cookie so SSR (server layouts) render the correct locale on the next
  // navigation, eliminating the post-login hydration flash. 1-year expiry.
  try {
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`
  } catch {}
  document.documentElement.setAttribute('data-locale', l)
  document.documentElement.lang = l
  window.dispatchEvent(new Event('hackagent-locale-change'))
}

// ── React context (seeded by <LocaleProvider initial={...}> from server layout) ─

const LocaleContext = createContext<Locale | null>(null)

export function LocaleProvider({
  initial,
  children,
}: {
  initial: Locale
  children: React.ReactNode
}) {
  const [locale, setLocaleState] = useState<Locale>(initial)

  useEffect(() => {
    // Sync DOM attribute + html lang on mount (idempotent — bootstrap script may already have set it).
    document.documentElement.setAttribute('data-locale', locale)
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    const handler = () => setLocaleState(getLocale())
    window.addEventListener('hackagent-locale-change', handler)
    return () => window.removeEventListener('hackagent-locale-change', handler)
  }, [])

  return (
    <LocaleContext.Provider value={locale}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale(): [Locale, (l: Locale) => void] {
  const ctx = useContext(LocaleContext)
  // Fallback path (no provider in tree — public/auth layouts): lazy-init from DOM on client.
  const [standalone, setStandalone] = useState<Locale>(() =>
    ctx ?? (typeof window === 'undefined' ? DEFAULT_LOCALE : getLocale())
  )

  useEffect(() => {
    if (ctx != null) return
    setStandalone(getLocale())
    const handler = () => setStandalone(getLocale())
    window.addEventListener('hackagent-locale-change', handler)
    return () => window.removeEventListener('hackagent-locale-change', handler)
  }, [ctx])

  const locale = ctx ?? standalone

  const changeLocale = useCallback((l: Locale) => {
    setLocale(l)
    setStandalone(l)
    // Context value will update on next `hackagent-locale-change` event via LocaleProvider's listener.
  }, [])

  return [locale, changeLocale]
}

export function useT(): (key: TranslationKey) => string {
  const [locale] = useLocale()
  return useCallback(
    (key: TranslationKey) => translations[locale][key] ?? translations['zh'][key] ?? key,
    [locale]
  )
}

// ── Bilingual summary helper ──────────────────────────────────────────────────
export type BilingualSummary = { zh: string; en: string }

export function getSummary(summary: string | BilingualSummary | undefined, locale: Locale): string {
  if (!summary) return ''
  if (typeof summary === 'string') return summary
  return summary[locale] ?? summary.zh ?? ''
}
