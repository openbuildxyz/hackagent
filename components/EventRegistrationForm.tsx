'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useLocale, useT, type TranslationKey } from '@/lib/i18n'

const DEFAULT_FIELD_I18N_KEYS: Record<string, TranslationKey> = {
  team_name: 'apply.field.team_name',
  project_name: 'apply.field.project_name',
  github_url: 'apply.field.github_url',
  track_id: 'apply.field.track_id',
  twitter: 'apply.field.twitter',
  demo_url: 'apply.field.demo_url',
  description: 'apply.field.description',
  contact_email: 'apply.field.contact_email',
  telegram: 'apply.field.telegram',
  discord: 'apply.field.discord',
}

export interface CustomField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'url'
  required: boolean
  default?: boolean
}

export interface Track {
  id: string
  name: string
  description?: string
  prize?: string
}

export interface EventRegistrationConfig {
  id: string
  name: string
  tracks: Track[] | null
  registration_deadline: string | null
  registration_config: {
    open: boolean
    auto_approve: boolean
    fields: CustomField[]
  } | null
}

function resolveFieldLabel(
  field: { key: string; label: string; default?: boolean },
  t: (k: TranslationKey) => string,
): string {
  if (field.default) {
    const key = DEFAULT_FIELD_I18N_KEYS[field.key]
    if (key) return t(key)
  }
  return field.label
}

export default function EventRegistrationForm({
  eventConfig,
  redirectPath,
  mode = 'page',
  onRegisteredChange,
}: {
  eventConfig: EventRegistrationConfig
  redirectPath: string
  mode?: 'page' | 'embedded'
  onRegisteredChange?: (registered: boolean) => void
}) {
  const router = useRouter()
  const t = useT()
  const [locale] = useLocale()
  const zh = locale === 'zh'
  const eventId = eventConfig.id

  const [submitting, setSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'pending' | 'approved' | 'rejected'>('idle')
  const [rejectReason, setRejectReason] = useState<string>('')
  const [existingTeamName, setExistingTeamName] = useState<string | null>(null)
  const [checkingRegistration, setCheckingRegistration] = useState(true)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [needsLogin, setNeedsLogin] = useState(false)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const meRes = await fetch('/api/me')
        if (cancelled) return
        if (!meRes.ok) {
          if (mode === 'page') {
            setNeedsLogin(true)
            router.replace(`/login?redirect=${encodeURIComponent(redirectPath)}`)
            return
          }
          setNeedsLogin(true)
          onRegisteredChange?.(false)
          setCheckingRegistration(false)
          return
        }

        const res = await fetch(`/api/events/${eventId}/my-registration`, { cache: 'no-store' })
        if (cancelled) return
        if (res.status === 404 || res.status === 401) {
          onRegisteredChange?.(false)
          setCheckingRegistration(false)
          return
        }
        if (!res.ok) {
          onRegisteredChange?.(false)
          setCheckingRegistration(false)
          return
        }
        const data = await res.json()
        if (cancelled) return
        if (data?.team_name) setExistingTeamName(data.team_name)
        if (data?.rejection_reason) setRejectReason(data.rejection_reason)
        if (data?.status === 'approved') {
          setSubmitStatus('approved')
          onRegisteredChange?.(true)
          if (data.team_name) setFormValues(v => ({ ...v, team_name: data.team_name }))
        } else if (data?.status === 'pending') {
          setSubmitStatus('pending')
          onRegisteredChange?.(true)
        } else if (data?.status === 'rejected') {
          setSubmitStatus('rejected')
          onRegisteredChange?.(false)
          const prefill: Record<string, string> = {}
          if (data.team_name) prefill.team_name = data.team_name
          if (data.github_url) prefill.github_url = data.github_url
          if (data.extra_fields && typeof data.extra_fields === 'object') {
            for (const [k, v] of Object.entries(data.extra_fields as Record<string, unknown>)) {
              if (typeof v === 'string') prefill[k] = v
            }
          }
          setFormValues(prev => ({ ...prefill, ...prev }))
        }
      } catch {
        onRegisteredChange?.(false)
      } finally {
        if (!cancelled) setCheckingRegistration(false)
      }
    }
    check()
    return () => { cancelled = true }
  }, [eventId, mode, onRegisteredChange, redirectPath, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const sessionRes = await fetch('/api/me')
    if (!sessionRes.ok) {
      router.push(`/login?redirect=${encodeURIComponent(redirectPath)}`)
      return
    }

    const fields = eventConfig.registration_config?.fields ?? []

    for (const field of fields) {
      if (field.required && !formValues[field.key]?.trim()) {
        toast.error(`${resolveFieldLabel(field, t)} ${t('apply.required')}`)
        return
      }
    }

    setSubmitting(true)
    try {
      const teamNameField = fields.find(f => f.key === 'team_name')
      const githubField = fields.find(f => f.key === 'github_url')
      const trackField = fields.find(f => f.key === 'track_id')

      const extraFields: Record<string, string> = {}
      for (const field of fields) {
        if (!field.default && formValues[field.key]) {
          extraFields[field.key] = formValues[field.key]
        }
      }

      const res = await fetch(`/api/events/${eventId}/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_name: teamNameField ? (formValues.team_name || null) : null,
          github_url: githubField ? (formValues.github_url || null) : null,
          track_id: trackField ? (formValues.track_id || null) : null,
          extra_fields: extraFields,
        }),
      })

      const data = await res.json()
      if (!res.ok && !data.duplicate) {
        throw new Error(data.error || t('reg.submitFailed'))
      }

      const nextStatus = data.status === 'approved' ? 'approved' : 'pending'
      setSubmitStatus(nextStatus)
      onRegisteredChange?.(true)
      toast.success(t('reg.submitSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('reg.submitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const config = eventConfig.registration_config
  const isOpen = config?.open ?? false
  const deadline = eventConfig.registration_deadline
  const isClosed = deadline ? new Date(deadline) < new Date() : false
  const fields = config?.fields ?? []

  if (checkingRegistration) {
    return (
      <Card className="border-token">
        <CardContent className="flex min-h-32 items-center justify-center py-8">
          <Loader2 className="animate-spin text-fg-subtle" size={24} />
        </CardContent>
      </Card>
    )
  }

  if (needsLogin) {
    return (
      <Card className="border-token">
        <CardContent className="py-8 text-center space-y-3">
          <p className="text-muted-foreground">{zh ? '登录后即可在本页完成报名。' : 'Sign in to complete registration on this page.'}</p>
          <Link href={`/login?redirect=${encodeURIComponent(redirectPath)}`}>
            <Button>{t('pub.detail.signInToApply')}</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (submitStatus === 'pending') {
    return (
      <Card className="border-token text-center">
        <CardContent className="pt-8 pb-8 space-y-4">
          <Clock className="mx-auto text-amber-500" size={40} />
          <h2 className="text-lg font-semibold">{t('reg.pendingStatus')}</h2>
          <p className="text-sm text-muted-foreground">{t('reg.alreadyRegistered.pendingDesc')}</p>
          {existingTeamName && (
            <p className="text-sm text-fg-muted">
              <span className="text-fg-subtle">{t('reg.alreadyRegistered.teamLabel')}:</span> {existingTeamName}
            </p>
          )}
          <Badge variant="secondary">{t('reg.manage.status.pending')}</Badge>
        </CardContent>
      </Card>
    )
  }

  if (submitStatus === 'approved') {
    return (
      <Card className="border-token text-center">
        <CardContent className="pt-8 pb-8 space-y-4">
          <CheckCircle2 className="mx-auto text-green-500" size={40} />
          <h2 className="text-lg font-semibold">{t('reg.alreadyRegistered.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('reg.alreadyRegistered.desc')}</p>
          {existingTeamName && (
            <p className="text-sm text-fg-muted">
              <span className="text-fg-subtle">{t('reg.alreadyRegistered.teamLabel')}:</span> {existingTeamName}
            </p>
          )}
          <Badge className="bg-green-100 text-green-700 border-green-200">{t('reg.manage.status.approved')}</Badge>
          <div className="pt-2">
            <Link href={`/apply/${eventId}/submit`}>
              <Button className="gap-2">
                {t('reg.alreadyRegistered.goSubmit')}
                <ArrowRight size={14} />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <section className="space-y-4">
      {!isOpen && (
        <Card className="border-token">
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-muted-foreground">{t('reg.applyBtnNotOpen')}</p>
            {mode === 'page' && (
              <Link href={`/events/public/${eventId}`}>
                <Button variant="outline" size="sm">{t('apply.viewEvent')}</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {isOpen && isClosed && (
        <Card className="border-token">
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-muted-foreground">{t('reg.closed')}</p>
            {mode === 'page' && (
              <Link href={`/events/public/${eventId}`}>
                <Button variant="outline" size="sm">{t('apply.viewEvent')}</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {isOpen && !isClosed && submitStatus === 'rejected' && (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="py-4 flex gap-3">
            <XCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
            <div className="space-y-1">
              <p className="text-sm font-medium text-red-700">{t('reg.rejectedStatus')}</p>
              <p className="text-sm text-red-700/80">{t('reg.alreadyRegistered.rejectedDesc')}</p>
              {rejectReason && (
                <p className="text-xs text-red-700/80 pt-1">{rejectReason}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isOpen && !isClosed && (
        <Card className="border-token">
          <CardHeader>
            <CardTitle className="text-xl">{t('reg.applyBtn')}</CardTitle>
            <CardDescription>
              {zh
                ? `${fields.length} 个报名字段`
                : `${fields.length} registration ${fields.length === 1 ? 'field' : 'fields'}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {fields.map(field => {
                if (field.key === 'track_id') {
                  const trackList = eventConfig.tracks ?? []
                  return (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={field.key}>
                        {resolveFieldLabel(field, t)}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      <select
                        id={field.key}
                        value={formValues[field.key] ?? ''}
                        onChange={e => setFormValues(v => ({ ...v, [field.key]: e.target.value }))}
                        className="w-full border rounded-md px-3 py-2 text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-ring"
                        required={field.required}
                      >
                        <option value="">{t('reg.trackPlaceholder')}</option>
                        {trackList.map(tr => (
                          <option key={tr.id} value={tr.id}>{tr.name}</option>
                        ))}
                      </select>
                    </div>
                  )
                }

                if (field.type === 'textarea') {
                  return (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={field.key}>
                        {resolveFieldLabel(field, t)}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      <Textarea
                        id={field.key}
                        rows={3}
                        value={formValues[field.key] ?? ''}
                        onChange={e => setFormValues(v => ({ ...v, [field.key]: e.target.value }))}
                        required={field.required}
                      />
                    </div>
                  )
                }

                return (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={field.key}>
                      {resolveFieldLabel(field, t)}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    <Input
                      id={field.key}
                      type={field.type === 'url' ? 'url' : 'text'}
                      value={formValues[field.key] ?? ''}
                      onChange={e => setFormValues(v => ({ ...v, [field.key]: e.target.value }))}
                      required={field.required}
                      placeholder={field.type === 'url' ? 'https://' : ''}
                    />
                  </div>
                )
              })}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin mr-2" />
                    {t('reg.submitting')}
                  </>
                ) : t('reg.applyBtn')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
