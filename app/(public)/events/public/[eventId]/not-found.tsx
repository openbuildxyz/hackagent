'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import PublicNavbar from '@/components/PublicNavbar'
import { useT } from '@/lib/i18n'

export default function PublicEventNotFound() {
  const t = useT()
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
      <PublicNavbar />
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div
          className="max-w-md w-full text-center p-8 rounded-xl"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div className="text-5xl mb-4" aria-hidden>🕳️</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-fg)' }}>
            {t('pub.notFound.title')}
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-fg-muted)' }}>
            {t('pub.notFound.desc')}
          </p>
          <Link
            href="/events/public"
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'white',
            }}
          >
            <ArrowLeft size={14} />
            {t('pub.notFound.back')}
          </Link>
        </div>
      </main>
    </div>
  )
}
