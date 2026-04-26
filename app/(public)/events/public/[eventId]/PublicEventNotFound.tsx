'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import PublicNavbar from '@/components/PublicNavbar'
import { useT } from '@/lib/i18n'

export default function PublicEventNotFound() {
  const t = useT()
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--color-bg)' }}>
      <PublicNavbar />
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-md text-center space-y-5">
          <div className="text-5xl opacity-40" aria-hidden>🔍</div>
          <h1
            className="text-2xl font-bold"
            style={{ color: 'var(--color-fg)' }}
          >
            {t('publicEvent.notFound.title')}
          </h1>
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            {t('publicEvent.notFound.description')}
          </p>
          <div className="pt-2">
            <Link href="/events/public">
              <Button variant="outline" size="sm">
                {t('publicEvent.notFound.backToList')}
              </Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
