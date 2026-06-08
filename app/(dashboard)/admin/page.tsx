'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Settings, Shield, Ticket, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useT } from '@/lib/i18n'

type DashboardData = {
  users: {
    total: number
    roles: Record<string, number>
    credits: number
    latestCreatedAt: string | null
  }
  configuration: {
    models: number
    configuredModels: number
    services: number
    missingServices: number
    readOnly: boolean
  }
}

export default function AdminOverviewPage() {
  const t = useT()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/dashboard')
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || t('admin.overview.loadFailed'))
        setData(body)
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('admin.overview.loadFailed')))
      .finally(() => setLoading(false))
  }, [t])

  return (
    <div className="py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shield size={22} className="text-[var(--color-fg-muted)]" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-fg)]">{t('admin.overview.title')}</h1>
            <p className="text-sm text-[var(--color-fg-muted)]">{t('admin.overview.subtitle')}</p>
          </div>
        </div>
        {data?.configuration.readOnly && <Badge variant="outline">{t('admin.overview.configReadOnly')}</Badge>}
      </div>

      {loading ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-8 text-sm text-[var(--color-fg-muted)]">{t('admin.common.loading')}</div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      ) : data && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t('admin.overview.users')}</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{data.users.total}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t('admin.overview.admins')}</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{data.users.roles.admin ?? 0}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t('admin.overview.configuredModels')}</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{data.configuration.configuredModels}/{data.configuration.models}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">{t('admin.overview.missingServices')}</CardTitle></CardHeader>
              <CardContent><div className="text-2xl font-semibold">{data.configuration.missingServices}</div></CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-[var(--color-fg)]">{t('admin.overview.userPermissions')}</h2>
                  <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{t('admin.overview.userPermissionsDesc')}</p>
                </div>
                <Users size={18} className="text-[var(--color-fg-muted)]" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(data.users.roles).map(([role, count]) => (
                  <Badge key={role} variant="outline">{role}: {count}</Badge>
                ))}
              </div>
              <Button asChild className="mt-5" size="sm"><Link href="/admin/users">{t('admin.overview.openUsers')}</Link></Button>
            </div>

            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-[var(--color-fg)]">{t('admin.invites.title')}</h2>
                  <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{t('admin.invites.subtitle')}</p>
                </div>
                <Ticket size={18} className="text-[var(--color-fg-muted)]" />
              </div>
              <Button asChild className="mt-5" size="sm"><Link href="/admin/invite-codes">{t('admin.overview.openInviteCodes')}</Link></Button>
            </div>

            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-[var(--color-fg)]">{t('admin.model.title')}</h2>
                  <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{t('admin.model.overviewDesc')}</p>
                </div>
                <Settings size={18} className="text-[var(--color-fg-muted)]" />
              </div>
              <Button asChild className="mt-5" size="sm"><Link href="/admin/model-config">{t('admin.overview.openModelConfig')}</Link></Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
