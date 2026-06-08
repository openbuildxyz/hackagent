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
import { useLocale } from '@/lib/i18n'
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
      if (!res.ok) throw new Error(data.error || 'Failed to load invite codes')
      setCodes(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invite codes')
    } finally {
      setLoading(false)
    }
  }, [])

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
        toast.error(data.error || 'Failed to generate invite codes')
        return
      }
      const created = Array.isArray(data) ? data : []
      setCodes((prev) => [...created, ...prev])
      toast.success(`Generated ${created.length} invite code${created.length === 1 ? '' : 's'}`)
    } finally {
      setCreating(false)
    }
  }

  const copyText = async (id: string, text: string) => {
    const ok = await copyToClipboard(text)
    if (!ok) {
      toast.error('Copy failed')
      return
    }
    setCopied(id)
    toast.success('Copied')
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="py-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Ticket size={22} className="text-[var(--color-fg-muted)]" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-fg)]">Invite codes</h1>
            <p className="text-sm text-[var(--color-fg-muted)]">Generate account invite codes manually for new user registration.</p>
          </div>
        </div>
        <Badge variant="outline">{unusedCodes.length} unused</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Generate codes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={count}
            onChange={(event) => setCount(event.target.value)}
            inputMode="numeric"
            className="w-full sm:w-28"
            aria-label="Invite code count"
          />
          <Button onClick={createCodes} disabled={creating} className="gap-1.5">
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Generate
          </Button>
          <Button
            variant="outline"
            disabled={unusedCodes.length === 0}
            onClick={() => copyText('all-unused', unusedCodes.map((item) => item.code).join('\n'))}
            className="gap-1.5"
          >
            {copied === 'all-unused' ? <Check size={14} /> : <Copy size={14} />}
            Copy unused
          </Button>
          <p className="text-xs text-[var(--color-fg-muted)]">You can generate 1 to 20 codes at a time.</p>
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
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Used by</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-[var(--color-fg-muted)]">Loading...</TableCell></TableRow>
              ) : codes.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-[var(--color-fg-muted)]">No invite codes yet.</TableCell></TableRow>
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
                        <Badge variant="secondary">Used</Badge>
                      ) : (
                        <Badge className="border-green-200 bg-green-50 text-green-700 hover:bg-green-50">Unused</Badge>
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
                        Copy
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
