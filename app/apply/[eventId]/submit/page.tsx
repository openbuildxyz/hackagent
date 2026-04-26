'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, Clock, AlertCircle, Github, ExternalLink } from 'lucide-react'
import { useT, useLocale } from '@/lib/i18n'
import { formatDate } from '@/lib/format-date'

interface Track {
  id: string
  name: string
  description?: string
}

interface EventConfig {
  id: string
  name: string
  tracks: Track[] | null
  submission_deadline: string | null
  banner_url: string | null
}

interface MyRegistration {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  team_name: string | null
  track_id: string | null
  project_id: string | null
  project: {
    id: string
    name: string
    github_url: string | null
    demo_url: string | null
    description: string | null
    status: string
    created_at: string
  } | null
}

const MAX_DESCRIPTION = 500

export default function SubmitProjectPage() {
  const t = useT()
  const [locale] = useLocale()
  const params = useParams()
  const eventId = params.eventId as string
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null)
  const [registration, setRegistration] = useState<MyRegistration | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [demoUrl, setDemoUrl] = useState('')
  const [description, setDescription] = useState('')
  const [teamName, setTeamName] = useState('')
  const [trackId, setTrackId] = useState('')

  const loadData = useCallback(async () => {
    // Check auth
    const meRes = await fetch('/api/me')
    if (!meRes.ok) {
      router.push(`/login?redirect=/apply/${eventId}/submit`)
      return
    }

    // Fetch event config and registration in parallel
    const [configRes, regRes] = await Promise.all([
      fetch(`/api/events/${eventId}/apply-config`),
      fetch(`/api/events/${eventId}/my-registration`),
    ])

    if (!configRes.ok) {
      setLoading(false)
      return
    }
    const config: EventConfig = await configRes.json()
    setEventConfig(config)

    if (regRes.status === 404) {
      // No registration found
      setLoading(false)
      return
    }

    if (regRes.ok) {
      const reg: MyRegistration = await regRes.json()
      setRegistration(reg)
      // Pre-fill team name and track from registration
      if (reg.team_name) setTeamName(reg.team_name)
      if (reg.track_id) setTrackId(reg.track_id)
    }

    setLoading(false)
  }, [eventId, router])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!registration) return

    if (!name.trim()) { toast.error(t('submit.nameRequired')); return }
    if (!githubUrl.trim()) { toast.error(t('submit.githubRequired')); return }
    if (!description.trim()) { toast.error(t('submit.descRequired')); return }
    if (description.length > MAX_DESCRIPTION) { toast.error(t('submit.descTooLong')); return }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/events/${eventId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_id: registration.id,
          name: name.trim(),
          github_url: githubUrl.trim(),
          demo_url: demoUrl.trim() || undefined,
          description: description.trim(),
          team_name: teamName.trim() || undefined,
          track_id: trackId || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || t('submit.failed'))
      }

      setSubmitted(true)
      toast.success(t('submit.success'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('submit.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" size={24} />
      </div>
    )
  }

  if (!eventConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">{t('submit.eventNotFound')}</p>
      </div>
    )
  }

  // No registration or not approved
  if (!registration) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <AlertCircle className="mx-auto text-amber-500" size={40} />
            <h2 className="text-lg font-semibold">{t('submit.noRegistration')}</h2>
            <p className="text-sm text-muted-foreground">{t('submit.noRegistrationDesc')}</p>
            <Button variant="outline" onClick={() => router.push(`/apply/${eventId}`)}>
              {t('submit.goRegister')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (registration.status === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <Clock className="mx-auto text-amber-500" size={40} />
            <h2 className="text-lg font-semibold">{t('submit.pendingApproval')}</h2>
            <p className="text-sm text-muted-foreground">{t('submit.pendingApprovalDesc')}</p>
            <Badge variant="secondary">{t('submit.statusPending')}</Badge>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (registration.status === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <AlertCircle className="mx-auto text-red-500" size={40} />
            <h2 className="text-lg font-semibold">{t('submit.rejected')}</h2>
            <p className="text-sm text-muted-foreground">{t('submit.rejectedDesc')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Already submitted
  if (registration.project || submitted) {
    const project = registration.project
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 space-y-4">
            <div className="text-center space-y-2">
              <CheckCircle2 className="mx-auto text-green-500" size={40} />
              <h2 className="text-lg font-semibold">{t('submit.alreadySubmitted')}</h2>
              <p className="text-sm text-muted-foreground">{t('submit.alreadySubmittedDesc')}</p>
            </div>
            {project && (
              <div className="border rounded-lg p-4 space-y-2 text-sm">
                <div className="font-medium text-base">{project.name}</div>
                {project.github_url && (
                  <a
                    href={project.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <Github size={13} />
                    <span className="truncate">{project.github_url}</span>
                  </a>
                )}
                {project.demo_url && (
                  <a
                    href={project.demo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink size={13} />
                    <span className="truncate">{project.demo_url}</span>
                  </a>
                )}
                <div className="text-muted-foreground">
                  {t('submit.submittedAt')}{formatDate(project.created_at, locale)}
                </div>
                <Badge variant="secondary">{t('submit.pendingReview')}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  const tracks = eventConfig.tracks ?? []
  const isSubmissionClosed = eventConfig.submission_deadline
    ? new Date(eventConfig.submission_deadline) < new Date()
    : false

  if (isSubmissionClosed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <Clock className="mx-auto text-fg-subtle" size={40} />
            <h2 className="text-lg font-semibold">{t('submit.deadlinePassed')}</h2>
            <p className="text-sm text-muted-foreground">{t('submit.deadlinePassedDesc')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface py-12 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{t('submit.title')}</h1>
          <p className="text-muted-foreground text-sm">{eventConfig.name}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('submit.projectInfo')}</CardTitle>
            <CardDescription>{t('submit.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">
                  {t('submit.projectName')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('submit.projectNamePlaceholder')}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="github_url">
                  {t('submit.githubUrl')} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="github_url"
                  type="url"
                  value={githubUrl}
                  onChange={e => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/..."
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="demo_url">{t('submit.demoUrl')}</Label>
                <Input
                  id="demo_url"
                  type="url"
                  value={demoUrl}
                  onChange={e => setDemoUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">
                  {t('submit.description')} <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="description"
                  rows={4}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={t('submit.descriptionPlaceholder')}
                  required
                />
                <p className={`text-xs text-right ${description.length > MAX_DESCRIPTION ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {description.length} / {MAX_DESCRIPTION}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="team_name">{t('submit.teamName')}</Label>
                <Input
                  id="team_name"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  placeholder={t('submit.teamNamePlaceholder')}
                />
              </div>

              {tracks.length > 1 && (
                <div className="space-y-1.5">
                  <Label htmlFor="track_id">{t('submit.track')}</Label>
                  <select
                    id="track_id"
                    value={trackId}
                    onChange={e => setTrackId(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">{t('submit.trackPlaceholder')}</option>
                    {tracks.map(tr => (
                      <option key={tr.id} value={tr.id}>{tr.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || description.length > MAX_DESCRIPTION}
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin mr-2" />
                    {t('submit.submitting')}
                  </>
                ) : t('submit.submitBtn')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
