'use client'

import { useT } from '@/lib/i18n'
import PublicNavbar from '@/components/PublicNavbar'

export default function VoteNotAvailable() {
  const t = useT()
  return (
    <div className="min-h-screen bg-surface">
      <PublicNavbar />
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-fg mb-2">{t('vote.notAvailable.title')}</h1>
          <p className="text-fg-muted">{t('vote.notAvailable.desc')}</p>
        </div>
      </div>
    </div>
  )
}
