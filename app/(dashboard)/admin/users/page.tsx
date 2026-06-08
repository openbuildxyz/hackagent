'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Coins, Search, ShieldCheck, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useLocale, useT } from '@/lib/i18n'
import { formatDateLong } from '@/lib/format-date'

type User = {
  id: string
  email: string
  role: string[]
  credits: number
  created_at: string
}

const ALL_ROLES = ['admin', 'organizer', 'reviewer', 'viewer']

const ROLE_COLORS: Record<string, string> = {
  admin: 'border-red-200 bg-red-50 text-red-700',
  organizer: 'border-violet-200 bg-violet-50 text-violet-700',
  reviewer: 'border-blue-200 bg-blue-50 text-blue-700',
  viewer: 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]',
}

export default function AdminUsersPage() {
  const t = useT()
  const [locale] = useLocale()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [pendingRole, setPendingRole] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [creditUser, setCreditUser] = useState<User | null>(null)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [creditSaving, setCreditSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  useEffect(() => {
    fetch('/api/admin/users')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('admin.users.loadFailed'))
        if (Array.isArray(data)) setUsers(data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('admin.users.loadFailed')))
      .finally(() => setLoading(false))
  }, [t])

  const roleCounts = useMemo(() => {
    return users.reduce<Record<string, number>>((acc, user) => {
      ;(user.role ?? []).forEach((role) => {
        acc[role] = (acc[role] ?? 0) + 1
      })
      return acc
    }, {})
  }, [users])

  const filtered = users.filter((user) => {
    const matchesSearch = user.email.toLowerCase().includes(search.toLowerCase()) || user.id.includes(search)
    const matchesRole = roleFilter === 'all' || (user.role ?? []).includes(roleFilter)
    return matchesSearch && matchesRole
  })

  const startEdit = (user: User) => {
    setEditing(user.id)
    setPendingRole((prev) => ({ ...prev, [user.id]: [...(user.role ?? [])] }))
  }

  const toggleRole = (userId: string, role: string) => {
    setPendingRole((prev) => {
      const cur = prev[userId] ?? []
      return {
        ...prev,
        [userId]: cur.includes(role) ? cur.filter((item) => item !== role) : [...cur, role],
      }
    })
  }

  const save = async (userId: string) => {
    const role = pendingRole[userId] ?? []
    if (role.length === 0) {
      toast.error(t('admin.users.selectRole'))
      return
    }

    setSaving(userId)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    })
    setSaving(null)

    if (res.ok) {
      setUsers((prev) => prev.map((user) => user.id === userId ? { ...user, role } : user))
      setEditing(null)
      toast.success(t('admin.users.rolesUpdated'))
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error || t('admin.users.saveRolesFailed'))
    }
  }

  const openCreditDialog = (user: User) => {
    setCreditUser(user)
    setCreditAmount('')
    setCreditReason('')
  }

  const closeCreditDialog = () => {
    if (creditSaving) return
    setCreditUser(null)
    setCreditAmount('')
    setCreditReason('')
  }

  const adjustCredits = async () => {
    if (!creditUser) return

    const amount = Number(creditAmount)
    if (!Number.isInteger(amount) || amount === 0) {
      toast.error(t('admin.users.creditAmountInvalid'))
      return
    }
    if (creditUser.credits + amount < 0) {
      toast.error(t('admin.users.creditNegative'))
      return
    }

    setCreditSaving(true)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: creditUser.id,
        action: 'credits.adjust',
        amount,
        reason: creditReason.trim() || undefined,
      }),
    })
    setCreditSaving(false)

    const data = await res.json().catch(() => ({}))
    if (res.ok && typeof data.credits === 'number') {
      setUsers((prev) => prev.map((user) => user.id === creditUser.id ? { ...user, credits: data.credits } : user))
      setCreditUser(null)
      setCreditAmount('')
      setCreditReason('')
      toast.success(t('admin.users.creditsUpdated').replace('{n}', String(data.credits)))
    } else {
      toast.error(data.error || t('admin.users.creditAdjustFailed'))
    }
  }

  const creditPreviewAmount = Number(creditAmount)
  const creditPreview =
    creditUser && Number.isInteger(creditPreviewAmount) && creditPreviewAmount !== 0
      ? creditUser.credits + creditPreviewAmount
      : null

  return (
    <div className="py-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Users size={22} className="text-[var(--color-fg-muted)]" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-fg)]">{t('admin.users.title')}</h1>
            <p className="text-sm text-[var(--color-fg-muted)]">{t('admin.users.subtitle')}</p>
          </div>
        </div>
        <Badge variant="outline">{t('admin.users.count').replace('{n}', String(users.length))}</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {ALL_ROLES.map((role) => (
          <button
            key={role}
            onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}
            className={`rounded-lg border px-4 py-3 text-left transition-colors ${
              roleFilter === role
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-surface)]'
            }`}
          >
            <div className="text-xs uppercase tracking-wider text-[var(--color-fg-muted)]">{role}</div>
            <div className="mt-1 text-xl font-semibold text-[var(--color-fg)]">{roleCounts[role] ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('admin.users.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => { setSearch(''); setRoleFilter('all') }}>
          {t('admin.users.clearFilters')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
        {error ? (
          <div className="flex items-center gap-2 p-6 text-sm text-red-700">
            <AlertCircle size={16} /> {error}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.users.colUser')}</TableHead>
                <TableHead>{t('admin.users.colRoles')}</TableHead>
                <TableHead>{t('admin.users.colCredits')}</TableHead>
                <TableHead>{t('admin.users.colRegistered')}</TableHead>
                <TableHead className="text-right">{t('admin.users.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-[var(--color-fg-muted)]">{t('admin.common.loading')}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-[var(--color-fg-muted)]">{t('admin.users.noMatches')}</TableCell></TableRow>
              ) : filtered.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="font-medium text-[var(--color-fg)]">{user.email}</div>
                    <div className="mt-0.5 font-mono text-xs text-[var(--color-fg-subtle)]">{user.id}</div>
                  </TableCell>
                  <TableCell>
                    {editing === user.id ? (
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_ROLES.map((role) => {
                          const active = (pendingRole[user.id] ?? []).includes(role)
                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() => toggleRole(user.id, role)}
                              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                                active
                                  ? 'border-[var(--color-fg)] bg-[var(--color-fg)] text-[var(--color-bg)]'
                                  : 'border-[var(--color-border)] text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)]'
                              }`}
                            >
                              {role}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {(user.role ?? []).map((role) => (
                          <span key={role} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role] ?? ROLE_COLORS.viewer}`}>
                            {role === 'admin' && <ShieldCheck size={11} />}
                            {role}
                          </span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-[var(--color-fg-muted)]">{user.credits}</TableCell>
                  <TableCell className="text-[var(--color-fg-muted)]">{formatDateLong(user.created_at, locale)}</TableCell>
                  <TableCell className="text-right">
                    {editing === user.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
                        <Button size="sm" onClick={() => save(user.id)} disabled={saving === user.id}>
                          {saving === user.id ? t('common.saving') : t('common.save')}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openCreditDialog(user)}>
                          <Coins size={14} />
                          {t('admin.users.credits')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => startEdit(user)}>
                          {t('admin.users.editRoles')}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!creditUser} onOpenChange={(open) => { if (!open) closeCreditDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.users.adjustCredits')}</DialogTitle>
            <DialogDescription>
              {creditUser
                ? t('admin.users.currentBalance')
                  .replace('{email}', creditUser.email)
                  .replace('{credits}', String(creditUser.credits))
                : t('admin.users.updateCredits')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="credit-amount" className="text-sm font-medium text-[var(--color-fg)]">
                {t('admin.users.amount')}
              </label>
              <Input
                id="credit-amount"
                value={creditAmount}
                onChange={(event) => setCreditAmount(event.target.value)}
                inputMode="numeric"
                placeholder={t('admin.users.amountPlaceholder')}
                disabled={creditSaving}
              />
              <p className={`text-xs ${creditPreview !== null && creditPreview < 0 ? 'text-red-700' : 'text-[var(--color-fg-muted)]'}`}>
                {creditPreview === null
                  ? t('admin.users.amountHint')
                  : t('admin.users.newBalance').replace('{n}', String(creditPreview))}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="credit-reason" className="text-sm font-medium text-[var(--color-fg)]">
                {t('admin.users.reason')}
              </label>
              <Textarea
                id="credit-reason"
                value={creditReason}
                onChange={(event) => setCreditReason(event.target.value)}
                maxLength={500}
                placeholder={t('admin.users.reasonPlaceholder')}
                disabled={creditSaving}
              />
              <p className="text-xs text-[var(--color-fg-muted)]">{creditReason.length}/500</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={closeCreditDialog} disabled={creditSaving}>{t('common.cancel')}</Button>
            <Button onClick={adjustCredits} disabled={creditSaving || !creditAmount.trim() || (creditPreview !== null && creditPreview < 0)}>
              {creditSaving ? t('common.saving') : t('admin.users.applyAdjustment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
