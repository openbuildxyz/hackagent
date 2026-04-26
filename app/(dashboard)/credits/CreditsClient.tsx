'use client'

import { useCallback, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Coins, Zap, Star, Building2, Loader2, AlertTriangle, Info, Mail } from 'lucide-react'
import { useT } from '@/lib/i18n'
import type { TranslationKey } from '@/lib/i18n'

type PackageKey = 'starter' | 'standard' | 'pro' | 'enterprise'

const PACKAGES: {
  key: PackageKey
  nameKey: TranslationKey
  price: number
  credits: number
  discount: number
  recommended?: boolean
  icon: React.ReactNode
}[] = [
  { key: 'starter', nameKey: 'credits.pkg.starter', price: 5, credits: 50, discount: 0, icon: <Zap size={18} /> },
  { key: 'standard', nameKey: 'credits.pkg.standard', price: 20, credits: 220, discount: 10, icon: <Star size={18} /> },
  { key: 'pro', nameKey: 'credits.pkg.pro', price: 50, credits: 600, discount: 20, recommended: true, icon: <Coins size={18} /> },
  { key: 'enterprise', nameKey: 'credits.pkg.enterprise', price: 200, credits: 2800, discount: 30, icon: <Building2 size={18} /> },
]

const CONSUMPTION_ROWS: { op: TranslationKey; val: TranslationKey }[] = [
  { op: 'credits.consumption.basic', val: 'credits.consumption.basicVal' },
  { op: 'credits.consumption.standard', val: 'credits.consumption.standardVal' },
  { op: 'credits.consumption.advanced', val: 'credits.consumption.advancedVal' },
  { op: 'credits.consumption.flagship', val: 'credits.consumption.flagshipVal' },
  { op: 'credits.consumption.top', val: 'credits.consumption.topVal' },
  { op: 'credits.consumption.github', val: 'credits.consumption.githubVal' },
  { op: 'credits.consumption.sonar', val: 'credits.consumption.sonarVal' },
  { op: 'credits.consumption.web3', val: 'credits.consumption.web3Val' },
]

export default function CreditsClient({ initialBalance }: { initialBalance: number }) {
  const t = useT()
  const [balance, setBalance] = useState<number>(initialBalance)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadBalance = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/credits', { credentials: 'same-origin' })
      const text = await res.text()
      let data: { credits?: number; error?: string } = {}
      try { data = JSON.parse(text) } catch { /* non-JSON */ }
      if (!res.ok) {
        console.error('[credits] /api/credits failed', { status: res.status, body: text })
        setLoadError(`${res.status}: ${data.error || text.slice(0, 80)}`)
      } else if (typeof data.credits === 'number') {
        setBalance(data.credits)
      }
    } catch (err) {
      console.error('[credits] /api/credits network error', err)
      setLoadError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{t('credits.title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t('credits.subtitle')}</p>
      </div>

      <div
        className="mb-6 flex items-start gap-3 rounded-lg p-4 border border-l-[3px]"
        style={{
          backgroundColor: 'var(--color-surface-2)',
          borderColor: 'var(--color-border)',
          borderLeftColor: 'var(--color-accent)',
        }}
      >
        <Info size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--color-accent)' }} />
        <div className="flex-1 text-sm">
          <p className="font-semibold" style={{ color: 'var(--color-fg)' }}>{t('credits.topUpDisabled')}</p>
          <p className="mt-1" style={{ color: 'var(--color-fg-muted)' }}>{t('credits.topUpDisabledDesc')}</p>
        </div>
        <a
          href="mailto:hackathon@openbuild.xyz"
          className="shrink-0 text-sm font-medium underline underline-offset-2 hover:opacity-80"
          style={{ color: 'var(--color-accent)' }}
        >
          {t('credits.contactSupport')}
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left side */}
        <div className="space-y-6">
          {/* Balance card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Coins size={16} />
                {t('credits.currentBalance')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  {t('credits.loading')}
                </div>
              ) : loadError ? (
                <div className="flex items-start gap-2 text-amber-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t('credits.loadFailed')}</p>
                    <p className="text-xs text-muted-foreground mb-2">{loadError}</p>
                    <Button size="sm" variant="outline" onClick={loadBalance}>
                      {t('credits.retry')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold">{balance}</span>
                  <span className="text-muted-foreground mb-1">{t('credits.unit')}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Consumption table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('credits.consumption.title')}</CardTitle>
              <CardDescription>{t('credits.consumption.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t('credits.consumption.colOp')}</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">{t('credits.consumption.colCredits')}</th>
                  </tr>
                </thead>
                <tbody>
                  {CONSUMPTION_ROWS.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-2.5 text-foreground">{t(row.op)}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap">{t(row.val)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* Right side: packages */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
          {PACKAGES.map(pkg => (
            <Card
              key={pkg.key}
              className={`relative flex flex-col ${
                pkg.recommended
                  ? 'border-2 border-[var(--color-fg)] shadow-md'
                  : 'border'
              }`}
            >
              {pkg.recommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-[var(--color-fg)] text-white px-3">
                    {t('credits.pkg.recommended')}
                  </Badge>
                </div>
              )}
              <CardHeader className="pb-3 pt-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${pkg.recommended ? 'bg-[var(--color-fg)] text-white' : 'bg-surface-2 text-fg-muted'}`}>
                      {pkg.icon}
                    </div>
                    <CardTitle className="text-base">{t(pkg.nameKey)}</CardTitle>
                  </div>
                  {pkg.discount > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {t('credits.pkg.discount').replace('{n}', String(pkg.discount))}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-bold">${pkg.price}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Coins size={14} className="text-muted-foreground" />
                    <span className="text-sm font-semibold">
                      {pkg.credits.toLocaleString()} {t('credits.unit')}
                    </span>
                    {pkg.discount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {t('credits.pkg.original').replace('{n}', (pkg.credits * 0.1).toFixed(0))}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  className="w-full"
                  variant="outline"
                  asChild
                  title={t('credits.topUpDisabledDesc')}
                >
                  <a href={`mailto:hackathon@openbuild.xyz?subject=${encodeURIComponent('HackAgent credits top-up')}&body=${encodeURIComponent(`Package: ${pkg.key} ($${pkg.price} → ${pkg.credits} credits)`)}`}>
                    <Mail size={14} className="mr-1.5" />
                    {t('credits.contactSupport')}
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
