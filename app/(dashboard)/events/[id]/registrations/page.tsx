'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { ArrowLeft, Check, X, Loader2, Users } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { formatDateShort } from '@/lib/format-date'

interface Registration {
  id: string
  event_id: string
  user_id: string
  team_name: string | null
  github_url: string | null
  track_id: string | null
  extra_fields: Record<string, string> | null
  status: 'pending' | 'approved' | 'rejected'
  reject_reason: string | null
  project_id: string | null
  submitted_at: string
  is_agent: boolean | null
  agent_id: string | null
  users: { email: string } | null
}

interface Track {
  id: string
  name: string
}

export default function RegistrationsPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const t = useT()

  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectTargetIds, setRejectTargetIds] = useState<string[]>([])
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [regRes, eventRes] = await Promise.all([
        fetch(`/api/events/${id}/registrations`),
        fetch(`/api/events/${id}`),
      ])
      if (!regRes.ok) { router.replace('/events'); return }
      const regData: Registration[] = await regRes.json()
      setRegistrations(regData)
      if (eventRes.ok) {
        const ev = await eventRes.json()
        setTracks(Array.isArray(ev.tracks) ? ev.tracks : [])
      }
    } catch {
      toast.error('加载失败')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { fetchData() }, [fetchData])

  const trackName = (trackId: string | null) => {
    if (!trackId) return null
    return tracks.find(tr => tr.id === trackId)?.name ?? trackId
  }

  const handleApprove = async (ids: string[]) => {
    setActionLoading(true)
    let successCount = 0
    for (const regId of ids) {
      const res = await fetch(`/api/events/${id}/registrations/${regId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      if (res.ok) successCount++
    }
    setActionLoading(false)
    toast.success(`${t('reg.manage.approveSuccess')}（${successCount}/${ids.length}）`)
    setSelected(new Set())
    fetchData()
  }

  const openRejectDialog = (ids: string[]) => {
    setRejectTargetIds(ids)
    setRejectReason('')
    setRejectDialogOpen(true)
  }

  const handleReject = async () => {
    setActionLoading(true)
    let successCount = 0
    for (const regId of rejectTargetIds) {
      const res = await fetch(`/api/events/${id}/registrations/${regId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reject_reason: rejectReason }),
      })
      if (res.ok) successCount++
    }
    setActionLoading(false)
    setRejectDialogOpen(false)
    toast.success(`${t('reg.manage.rejectSuccess')}（${successCount}/${rejectTargetIds.length}）`)
    setSelected(new Set())
    fetchData()
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    const pending = registrations.filter(r => r.status === 'pending').map(r => r.id)
    if (pending.every(id => selected.has(id))) {
      setSelected(new Set())
    } else {
      setSelected(new Set(pending))
    }
  }

  const pendingIds = registrations.filter(r => r.status === 'pending').map(r => r.id)
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every(id => selected.has(id))

  const statusBadge = (status: Registration['status']) => {
    if (status === 'approved') return <Badge className="bg-green-100 text-green-700 border-green-200">{t('reg.manage.status.approved')}</Badge>
    if (status === 'rejected') return <Badge variant="destructive">{t('reg.manage.status.rejected')}</Badge>
    return <Badge variant="secondary">{t('reg.manage.status.pending')}</Badge>
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[300px]">
        <Loader2 className="animate-spin" size={24} />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/events/${id}`} aria-label={t('reg.manage.backLabel')} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users size={18} />
            {t('reg.manage.title')}
          </h1>
        </div>
      </div>

      {/* Batch actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <span className="text-sm text-blue-700 font-medium">
            {t('reg.manage.selected').replace('{n}', String(selected.size))}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
            onClick={() => handleApprove(Array.from(selected))}
            disabled={actionLoading}
          >
            <Check size={13} />
            {t('reg.manage.batchApprove')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
            onClick={() => openRejectDialog(Array.from(selected))}
            disabled={actionLoading}
          >
            <X size={13} />
            {t('reg.manage.batchReject')}
          </Button>
        </div>
      )}

      {registrations.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">{t('reg.manage.noData')}</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allPendingSelected}
                    onCheckedChange={toggleAll}
                    disabled={pendingIds.length === 0}
                  />
                </TableHead>
                <TableHead>{t('reg.manage.team')}</TableHead>
                <TableHead>{t('reg.manage.source')}</TableHead>
                <TableHead>{t('reg.manage.email')}</TableHead>
                <TableHead>{t('reg.manage.track')}</TableHead>
                <TableHead>{t('reg.manage.github')}</TableHead>
                <TableHead>{t('reg.manage.time')}</TableHead>
                <TableHead>{t('reg.manage.status')}</TableHead>
                <TableHead className="text-right">{t('reg.manage.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.map(reg => (
                <TableRow key={reg.id} className={selected.has(reg.id) ? 'bg-blue-50/50' : ''}>
                  <TableCell>
                    {reg.status === 'pending' && (
                      <Checkbox
                        checked={selected.has(reg.id)}
                        onCheckedChange={() => toggleSelect(reg.id)}
                      />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{reg.team_name ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    {reg.is_agent ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 text-xs font-medium"
                        title={reg.agent_id ?? undefined}
                      >
                        <span aria-hidden>🤖</span>
                        {t('reg.manage.sourceAgent')}
                        {reg.agent_id && (
                          <span className="font-mono text-[10px] opacity-70 ml-0.5">
                            {reg.agent_id.length > 12 ? reg.agent_id.slice(0, 12) + '…' : reg.agent_id}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
                        <span aria-hidden>👤</span>
                        {t('reg.manage.sourceHuman')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{reg.users?.email ?? '—'}</TableCell>
                  <TableCell className="text-sm">{trackName(reg.track_id) ?? '—'}</TableCell>
                  <TableCell className="text-sm max-w-[160px] truncate">
                    {reg.github_url ? (
                      <a href={reg.github_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block">
                        {reg.github_url.replace('https://github.com/', '')}
                      </a>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDateShort(reg.submitted_at)}
                  </TableCell>
                  <TableCell>{statusBadge(reg.status)}</TableCell>
                  <TableCell className="text-right">
                    {reg.status === 'pending' && (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 gap-1 text-green-700 border-green-200 hover:bg-green-50"
                          onClick={() => handleApprove([reg.id])}
                          disabled={actionLoading}
                        >
                          <Check size={12} />
                          {t('reg.manage.approve')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 gap-1 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => openRejectDialog([reg.id])}
                          disabled={actionLoading}
                        >
                          <X size={12} />
                          {t('reg.manage.reject')}
                        </Button>
                      </div>
                    )}
                    {reg.status === 'rejected' && reg.reject_reason && (
                      <span className="text-xs text-muted-foreground truncate max-w-[120px] block text-right" title={reg.reject_reason}>
                        {reg.reject_reason}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('reg.manage.reject')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>{t('reg.manage.rejectReason')}</Label>
            <Textarea
              placeholder={t('reg.manage.rejectPlaceholder')}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" onClick={handleReject} disabled={actionLoading}>
              {actionLoading ? (
                <><Loader2 size={14} className="animate-spin mr-1" />{t('reg.manage.rejecting')}</>
              ) : t('reg.manage.rejectConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
