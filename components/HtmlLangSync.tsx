'use client'

import { useEffect } from 'react'
import { useLocale } from '@/lib/i18n'

export default function HtmlLangSync() {
  const [locale] = useLocale()
  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh'
  }, [locale])
  return null
}
