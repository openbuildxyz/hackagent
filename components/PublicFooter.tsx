'use client'

import Link from 'next/link'
import { useLocale } from '@/lib/i18n'

export default function PublicFooter() {
  const [locale] = useLocale()
  return (
    <footer
      className="px-4 sm:px-6 lg:px-8 py-8 border-t max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
    >
      <span>© 2026 HackAgent</span>
      <div className="flex items-center gap-6">
        <Link href="/events/public" className="hover:opacity-80 transition-opacity">
          {locale === 'zh' ? '活动广场' : 'Events'}
        </Link>
        <a
          href="/api/v1/skill.md"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--color-accent)' }}
          className="hover:opacity-80 transition-opacity"
        >
          Skill
        </a>
        <a
          href={locale === 'en' ? '/docs.en.html' : '/docs.html'}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:opacity-80 transition-opacity"
        >
          {locale === 'zh' ? '文档' : 'Docs'}
        </a>
        <Link href="/login" className="hover:opacity-80 transition-opacity">
          {locale === 'zh' ? '登录' : 'Login'}
        </Link>
      </div>
    </footer>
  )
}
