'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, Copy, Loader2, Plus, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { copyToClipboard } from '@/components/CopyButton'
import { useLocale, useT } from '@/lib/i18n'
import { formatDateLong } from '@/lib/format-date'

type InviteCode = {
  id: string
  code: string
  used_by: string | null
  used_at: string | null
  created_at: string
  event_id: string | null
  role: string | null
}

export default function AdminInviteCodesPage() {
  const t = useT()
  const [locale] = useLocale()
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [count, setCount] = useState('1')
  const [copied, setCopied] = useState<string | null>(null)

  const unusedCodes = useMemo(() => codes.filter((item) => !item.used_by && !item.used_at), [codes])

  const fetchCodes = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/invite-codes')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('admin.invites.loadFailed'))
      setCodes(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.invites.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchCodes()
  }, [fetchCodes])

  const createCodes = async () => {
    const parsed = Math.min(Math.max(Number(count) || 1, 1), 20)
    setCreating(true)
    try {
      const res = await fetch('/api/admin/invite-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: parsed }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || t('admin.invites.generateFailed'))
        return
      }
      const created = Array.isArray(data) ? data : []
      setCodes((prev) => [...created, ...prev])
      toast.success(t('admin.invites.generated').replace('{n}', String(created.length)))
    } finally {
      setCreating(false)
    }
  }

  const copyText = async (id: string, text: string) => {
    const ok = await copyToClipboard(text)
    if (!ok) {
      toast.error(t('common.copyFailed'))
      return
    }
    setCopied(id)
    toast.success(t('common.copiedToast'))
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="py-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Ticket size={22} className="text-[var(--color-fg-muted)]" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-fg)]">{t('admin.invites.title')}</h1>
            <p className="text-sm text-[var(--color-fg-muted)]">{t('admin.invites.subtitle')}</p>
          </div>
        </div>
        <Badge variant="outline">{t('admin.invites.unusedCount').replace('{n}', String(unusedCodes.length))}</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('admin.invites.generateTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={count}
            onChange={(event) => setCount(event.target.value)}
            inputMode="numeric"
            className="w-full sm:w-28"
            aria-label={t('admin.invites.countLabel')}
          />
          <Button onClick={createCodes} disabled={creating} className="gap-1.5">
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('admin.invites.generate')}
          </Button>
          <Button
            variant="outline"
            disabled={unusedCodes.length === 0}
            onClick={() => copyText('all-unused', unusedCodes.map((item) => item.code).join('\n'))}
            className="gap-1.5"
          >
            {copied === 'all-unused' ? <Check size={14} /> : <Copy size={14} />}
            {t('admin.invites.copyUnused')}
          </Button>
          <p className="text-xs text-[var(--color-fg-muted)]">{t('admin.invites.generateHint')}</p>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
        {error ? (
          <div className="flex items-center gap-2 p-6 text-sm text-red-700">
            <AlertCircle size={16} /> {error}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.invites.colCode')}</TableHead>
                <TableHead>{t('admin.invites.colStatus')}</TableHead>
                <TableHead>{t('admin.invites.colCreated')}</TableHead>
                <TableHead>{t('admin.invites.colUsedBy')}</TableHead>
                <TableHead className="text-right">{t('admin.invites.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-[var(--color-fg-muted)]">{t('admin.common.loading')}</TableCell></TableRow>
              ) : codes.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-[var(--color-fg-muted)]">{t('admin.invites.empty')}</TableCell></TableRow>
              ) : codes.map((item) => {
                const used = Boolean(item.used_by || item.used_at)
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <code className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 font-mono text-sm">
                        {item.code}
                      </code>
                    </TableCell>
                    <TableCell>
                      {used ? (
                        <Badge variant="secondary">{t('admin.invites.used')}</Badge>
                      ) : (
                        <Badge className="border-green-200 bg-green-50 text-green-700 hover:bg-green-50">{t('admin.invites.unused')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-[var(--color-fg-muted)]">
                      {formatDateLong(item.created_at, locale)}
                    </TableCell>
                    <TableCell>
                      {item.used_by ? (
                        <code className="font-mono text-xs text-[var(--color-fg-muted)]">{item.used_by}</code>
                      ) : (
                        <span className="text-sm text-[var(--color-fg-subtle)]">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => copyText(item.id, item.code)}
                      >
                        {copied === item.id ? <Check size={13} /> : <Copy size={13} />}
                        {t('common.copy')}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
