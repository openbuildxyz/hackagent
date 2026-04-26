'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

interface Props {
  eventId: string
  onGenerated: (url: string) => void
}

export default function AIBannerButton({ eventId, onGenerated }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [quotaInfo, setQuotaInfo] = useState<{ used: number; quota: number } | null>(null)

  async function generate() {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch(`/api/events/${eventId}/generate-banner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errMsg = data?.message || data?.error || `${t('event.banner.generateFailed')} (${res.status})`
        setErr(errMsg)
        toast.error(errMsg)
        return
      }
      onGenerated(data.url)
      setQuotaInfo({ used: data.used, quota: data.quota })
      setOpen(false)
      setPrompt('')
      toast.success(t('event.banner.generated'))
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : t('event.banner.generateFailed')
      setErr(errMsg)
      toast.error(errMsg)
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {t('event.banner.aiLabel')}
        {quotaInfo && (
          <span className="text-xs text-muted-foreground">
            ({quotaInfo.used}/{quotaInfo.quota})
          </span>
        )}
      </Button>
    )
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="text-sm font-medium">{t('event.banner.aiLabel')}</div>
      <textarea
        className="w-full min-h-[60px] rounded border bg-background px-2 py-1.5 text-sm"
        placeholder={t('event.banner.aiPlaceholder')}
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        disabled={loading}
      />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={generate} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('event.banner.generating')}
            </>
          ) : (
            t('event.banner.generate')
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false)
            setErr(null)
          }}
          disabled={loading}
        >
          {t('common.cancel')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t('event.banner.quotaPerEvent')} {quotaInfo ? quotaInfo.quota : 3} {t('event.banner.quotaPerEventSuffix')}
        </span>
      </div>
      {err && <div className="text-xs text-red-500">{err}</div>}
    </div>
  )
}
