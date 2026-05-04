'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import ProjectsTable from './ProjectsTable'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import ImageUpload from '@/components/ImageUpload'
import {
  Upload,
  Play,
  ExternalLink,
  ArrowLeft,
  Github,
  Globe,
  Tag,
  Users,
  Pencil,
  Plus,
  Trash2,
  Search,
  UserCheck,
  CheckCircle2,
  Clock,
  Bot,
  Loader2,
  Trophy,
  Vote,
  ClipboardList,
  UsersRound,
  Sparkles,
  ImageIcon,
} from 'lucide-react'
import { MODEL_NAMES, MODEL_COLORS, MODEL_CREDITS } from '@/lib/models'
import { useT, useLocale } from '@/lib/i18n'
import EventStatusStepper from '@/components/EventStatusStepper'
import EventCover from '@/components/EventCover'

type Track = {
  id: string
  name: string
  description?: string
  prize?: string
}

type Event = {
  id: string
  name: string
  track: string | null
  description: string | null
  dimensions: Array<{ name: string; weight: number }>
  web3_enabled: boolean
  models: string[]
  status: string
  mode: string
  created_at: string
  column_mapping?: Record<string, string | null>
  tracks?: Track[]
  banner_url?: string | null
  banner_gen_count?: number | null
  registration_deadline?: string | null
  submission_deadline?: string | null
  registration_config?: { open: boolean; auto_approve: boolean; fields: unknown[] } | null
  cancelled_reason?: string | null
}

const BANNER_QUOTA = 3
const BANNER_GENERATION_TIMEOUT_MS = 120_000

// OPE-98: deterministic deadline formatter — `toLocaleString('zh-CN')` diverges
// between Node ICU and V8, surfacing as React #418 on hydration.
function pad(n: number) { return n < 10 ? '0' + n : String(n) }
function formatDeadline(iso: string, locale?: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  if (locale === 'zh') {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  // EN: Apr 25, 2026 14:30
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type Project = {
  id: string
  name: string
  github_url: string | null
  demo_url: string | null
  pitch_url: string | null
  team_name: string | null
  tags: string[] | null
  status: string
  analysis_status: string | null
  track_ids?: string[]
  extra_fields: Record<string, string> | null
}

type Reviewer = {
  id: string
  user_id: string | null
  email: string
  invite_status?: string
  created_at: string
  scored: number
  total: number
  status: 'pending' | 'in_progress' | 'done' | 'invite_pending'
}

// STATUS_MAP is built dynamically in the component using useT()


export default function EventDetailClient() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const t = useT()
  const [locale] = useLocale()

  const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    draft: { label: t('event.status.draft'), variant: 'secondary' },
    recruiting: { label: t('event.status.recruiting'), variant: 'default' },
    hacking: { label: t('event.status.hacking'), variant: 'default' },
    judging: { label: t('event.status.judging'), variant: 'default' },
    done: { label: t('event.status.done'), variant: 'outline' },
  }

  const [event, setEvent] = useState<Event | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  // OPE-98: defer time/locale-dependent renders until after hydration.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editTrack, setEditTrack] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editDimensions, setEditDimensions] = useState<Array<{ name: string; weight: number }>>([])
  const [editModels, setEditModels] = useState<string[]>([])
  const [editWeb3, setEditWeb3] = useState(false)
  const [editSonar, setEditSonar] = useState(false)
  const [editTracks, setEditTracks] = useState<Track[]>([])
  const [editBannerUrl, setEditBannerUrl] = useState<string>('')
  const [editSaving, setEditSaving] = useState(false)

  // AI banner generation
  const [bannerPrompt, setBannerPrompt] = useState('')
  const [generatingBanner, setGeneratingBanner] = useState(false)
  const [generatedBannerUrl, setGeneratedBannerUrl] = useState<string | null>(null)
  const [applyingBanner, setApplyingBanner] = useState(false)
  const [bannerUsed, setBannerUsed] = useState(0)

  // Reviewer management state
  const [reviewers, setReviewers] = useState<Reviewer[]>([])
  const [reviewerSheetOpen, setReviewerSheetOpen] = useState(false)
  const [preAnalyzeStatus, setPreAnalyzeStatus] = useState<{ total: number; completed: number; running: number; ready: boolean } | null>(null)
  const [preAnalyzing, setPreAnalyzing] = useState(false)
  const [workerPolling, setWorkerPolling] = useState(false)

  // Credits confirm dialog state
  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false)
  const [currentCredits, setCurrentCredits] = useState<number | null>(null)
  const [creditsLoading, setCreditsLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)

  // Cancel event dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [searchEmail, setSearchEmail] = useState('')
  const [searchResult, setSearchResult] = useState<{ id: string; email: string } | null>(null)
  const [userNotFound, setUserNotFound] = useState(false)
  const [searching, setSearching] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [loadingReviewers, setLoadingReviewers] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [eventRes, projectsRes] = await Promise.all([
          fetch(`/api/events/${id}`),
          fetch(`/api/events/${id}/projects`),
        ])

        if (!eventRes.ok) {
          if (eventRes.status === 404 || eventRes.status === 403) {
            router.replace(`/events/public/${id}`)
            return
          }
          const errData = await eventRes.json().catch(() => ({}))
          toast.error(`${t('event.loadFailed')} | debug: ${JSON.stringify(errData)}`)
          router.push('/dashboard')
          return
        }

        const eventData = await eventRes.json()
        const projectsData = projectsRes.ok ? await projectsRes.json() : []

        setEvent(eventData)
        setProjects(projectsData)
        setBannerUsed(eventData.banner_gen_count ?? 0)
        setLoading(false)

        if (eventData.mode === 'panel_review') {
          fetchReviewers()
          // Fetch pre-analysis status
          fetch(`/api/events/${id}/batch-preanalyze`)
            .then(r => r.json())
            .then(d => {
              setPreAnalyzeStatus(d)
              // If worker is already running (e.g. after page refresh), resume polling
              if (!d.ready && d.running > 0) setWorkerPolling(true)
            })
            .catch(() => {})
        }
      } catch {
        toast.error(t('event.loadFailed'))
        setLoading(false)
      }
    }

    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router])

  // Poll pre-analysis status every 5s while worker is running
  useEffect(() => {
    if (!workerPolling && !preAnalyzeStatus?.running) return
    if (preAnalyzeStatus?.ready) { setWorkerPolling(false); return }
    const timer = setInterval(() => {
      fetch(`/api/events/${id}/batch-preanalyze`)
        .then(r => r.json())
        .then(d => {
          setPreAnalyzeStatus(d)
          if (d.ready || (d.running === 0 && d.completed === d.total)) {
            setWorkerPolling(false)
          }
        })
        .catch(() => {})
      // Also refresh project list to reflect updated analysis_status
      fetch(`/api/events/${id}/projects`)
        .then(r => r.json())
        .then(d => { if (Array.isArray(d)) setProjects(d) })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(timer)
  }, [workerPolling, preAnalyzeStatus?.running, preAnalyzeStatus?.ready, id])

  const fetchReviewers = async () => {
    setLoadingReviewers(true)
    try {
      const res = await fetch(`/api/events/${id}/reviewers`)
      if (res.ok) {
        const data = await res.json()
        setReviewers(data)
      }
    } finally {
      setLoadingReviewers(false)
    }
  }

  const handleSearchUser = async () => {
    if (!searchEmail.trim()) return
    setSearching(true)
    setSearchResult(null)
    setUserNotFound(false)
    try {
      const res = await fetch(`/api/users?email=${encodeURIComponent(searchEmail.trim())}`)
      if (res.ok) {
        const data = await res.json()
        setSearchResult(data)
      } else {
        // User not found — show "send invite email" option
        setUserNotFound(true)
      }
    } finally {
      setSearching(false)
    }
  }

  const handleInviteReviewer = async () => {
    if (!searchResult && !userNotFound) return
    setInviting(true)
    try {
      const body = searchResult
        ? { user_id: searchResult.id }
        : { email: searchEmail.trim() }
      const res = await fetch(`/api/events/${id}/reviewers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || t('reviewer.sheet.inviteFailed'))
        return
      }
      if (data.type === 'invite_sent') {
        toast.success(`${t('reviewer.sheet.sendInvite')} → ${data.email}`)
      } else {
        toast.success(`${t('reviewer.sheet.invite')}: ${searchResult?.email ?? searchEmail}`)
      }
      setSearchEmail('')
      setSearchResult(null)
      setUserNotFound(false)
      fetchReviewers()
    } finally {
      setInviting(false)
    }
  }

  const handleStatusAction = async (action: 'publish' | 'close_registration' | 'start_review' | 'publish_result') => {
    setStatusLoading(true)
    try {
      const res = await fetch(`/api/events/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || t('common.saveFailed'))
        return
      }
      setEvent(prev => prev ? { ...prev, status: data.status } : prev)
      toast.success(
        action === 'publish' ? t('event.action.publish') :
        action === 'start_review' ? t('event.action.startReview') :
        t('event.action.publishResult')
      )
      if (action === 'start_review') {
        // Refresh projects to reflect new pending status and start polling
        const projectsRes = await fetch(`/api/events/${id}/projects`)
        if (projectsRes.ok) {
          const projectsData = await projectsRes.json()
          setProjects(projectsData)
        }
        setWorkerPolling(true)
      }
      if (action === 'publish_result') {
        router.refresh()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setStatusLoading(false)
    }
  }

  const handleCancelEvent = async () => {
    setCancelling(true)
    try {
      const res = await fetch(`/api/events/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason: cancelReason.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || t('event.cancel.failed'))
        return
      }
      setEvent(prev => prev ? {
        ...prev,
        status: data.status,
        cancelled_reason: cancelReason.trim() || null,
      } : prev)
      toast.success(t('event.cancel.success'))
      setCancelDialogOpen(false)
      setCancelReason('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('event.cancel.failed'))
    } finally {
      setCancelling(false)
    }
  }

  const handleGenerateBanner = async () => {
    if (!event || bannerUsed >= BANNER_QUOTA) return
    setGeneratingBanner(true)
    try {
      const res = await fetch(`/api/events/${id}/generate-banner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: bannerPrompt.trim() || undefined }),
        signal: AbortSignal.timeout(BANNER_GENERATION_TIMEOUT_MS),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const detail = data?.message || data?.error || `${res.status}`
        throw new Error(`${t('event.banner.generateFailedRetry')}：${detail}`)
      }
      if (!data?.url) {
        throw new Error(t('event.banner.generateFailedRetry'))
      }
      setGeneratedBannerUrl(data.url)
      if (typeof data.used === 'number') setBannerUsed(data.used)
      toast.success(t('event.banner.generated'))
    } catch (err) {
      const message = err instanceof DOMException && err.name === 'TimeoutError'
        ? t('event.banner.generateTimeout')
        : err instanceof Error
          ? err.message
          : t('event.banner.generateFailedRetry')
      toast.error(message.includes(t('event.banner.generateFailedRetry')) ? message : `${t('event.banner.generateFailedRetry')}：${message}`)
    } finally {
      setGeneratingBanner(false)
    }
  }

  const handleApplyBanner = async () => {
    if (!generatedBannerUrl) return
    setApplyingBanner(true)
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banner_url: generatedBannerUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || t('common.saveFailed'))
      setEvent(prev => prev ? { ...prev, banner_url: generatedBannerUrl } : prev)
      setGeneratedBannerUrl(null)
      setBannerPrompt('')
      toast.success(t('event.banner.updated'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setApplyingBanner(false)
    }
  }

  const openEdit = () => {
    if (!event) return
    setEditName(event.name)
    setEditTrack(event.track ?? '')
    setEditDesc(event.description ?? '')
    setEditDimensions(event.dimensions.map(d => ({ ...d })))
    setEditModels([...event.models])
    setEditWeb3(event.web3_enabled)
    setEditTracks(event.tracks ? [...event.tracks] : [])
    setEditBannerUrl(event.banner_url ?? '')
    setEditOpen(true)
  }

  const totalEditWeight = editDimensions.reduce((s, d) => s + d.weight, 0)

  const updateDimName = (index: number, value: string) => {
    setEditDimensions(dims => dims.map((d, i) => i === index ? { ...d, name: value } : d))
  }

  const updateDimWeight = (index: number, value: number) => {
    const clamped = Math.min(100, Math.max(0, value || 0))
    setEditDimensions(dims => dims.map((d, i) => i === index ? { ...d, weight: clamped } : d))
  }

  const removeDim = (index: number) => {
    if (editDimensions.length <= 1) return
    setEditDimensions(dims => dims.filter((_, i) => i !== index))
  }

  const addDim = () => {
    setEditDimensions(dims => [...dims, { name: '', weight: 0 }])
  }

  const toggleModel = (model: string) => {
    setEditModels(prev =>
      prev.includes(model) ? prev.filter(m => m !== model) : [...prev, model]
    )
  }

  const addEditTrack = () => {
    const id = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
    setEditTracks(prev => [...prev, { id, name: '' }])
  }
  const removeEditTrack = (idx: number) => setEditTracks(prev => prev.filter((_, i) => i !== idx))
  const updateEditTrack = (idx: number, field: keyof Track, value: string) =>
    setEditTracks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t))

  const handleSave = async () => {
    if (!editName.trim()) {
      toast.error(t('edit.name'))
      return
    }
    if (totalEditWeight !== 100) {
      toast.error(`${t('edit.weightTotal')}${totalEditWeight}`)
      return
    }

    setEditSaving(true)
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          track: editTrack.trim() || null,
          description: editDesc.trim() || null,
          dimensions: editDimensions,
          models: editModels,
          web3_enabled: editWeb3,
          tracks: editTracks.filter(t => t.name.trim()),
          banner_url: editBannerUrl || null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('common.saveFailed'))

      setEvent(prev => prev ? {
        ...prev,
        name: editName.trim(),
        track: editTrack.trim() || null,
        description: editDesc.trim() || null,
        dimensions: editDimensions,
        models: editModels,
        web3_enabled: editWeb3,
        tracks: editTracks.filter(t => t.name.trim()),
        banner_url: editBannerUrl || null,
      } : prev)

      toast.success(t('edit.save'))
      setEditOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setEditSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6 animate-pulse">
        {/* Header skeleton */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-7 w-64 bg-surface-2 rounded" />
            <div className="h-4 w-40 bg-surface-2 rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-16 bg-surface-2 rounded" />
            <div className="h-8 w-20 bg-surface-2 rounded" />
            <div className="h-8 w-24 bg-surface-2 rounded" />
          </div>
        </div>
        {/* Stats cards skeleton */}
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-lg border p-4 space-y-2">
              <div className="h-4 w-20 bg-surface-2 rounded" />
              <div className="h-8 w-12 bg-surface-2 rounded" />
            </div>
          ))}
        </div>
        {/* Table skeleton */}
        <div className="rounded-lg border overflow-hidden">
          <div className="h-10 bg-surface-2 border-b" />
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-12 border-b flex items-center px-4 gap-4">
              <div className="h-4 w-4 bg-surface-2 rounded" />
              <div className="h-4 w-6 bg-surface-2 rounded" />
              <div className="h-4 w-40 bg-surface-2 rounded" />
              <div className="h-4 w-28 bg-surface-2 rounded" />
              <div className="h-4 w-20 bg-surface-2 rounded ml-auto" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!event) return null

  const statusInfo = STATUS_MAP[event.status] ?? STATUS_MAP.draft
  const isCancelled = event.status === 'cancelled'
  const creditCost =
    projects.length * event.models.length + (event.web3_enabled ? projects.length * 0.5 : 0) + (editSonar ? projects.length * 2 : 0)
  const isPanelMode = event.mode === 'panel_review'
  const canPublishResult = projects.length > 0 && projects.every(p => p.analysis_status === 'completed')

  const stepsDone = [
    true,
    projects.length > 0,
    ["judging","done"].includes(event.status) || projects.some(p => p.analysis_status === "completed"),
    ["judging","done"].includes(event.status) || reviewers.length > 0,
    event.status === "done",
  ]
  const currentStep = stepsDone.lastIndexOf(true) + 1
  const stepLabels = [
    t('event.step.create'),
    t('event.step.import'),
    t('event.step.review'),
    t('event.step.inviteReviewers'),
    t('event.step.publish'),
  ]

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft size={14} />
          {t('event.backToList')}
        </Link>

        {/* Progress Stepper */}
        <div className="flex items-start mb-6">
          {stepLabels.map((label, idx) => {
            const step = idx + 1
            const done = stepsDone[idx]
            const active = step === currentStep
            return (
              <div key={step} className="flex flex-col items-center shrink-0 flex-1 last:flex-none last:shrink-0">
                <div className="flex items-center w-full">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                    done
                      ? 'bg-indigo-600 text-white'
                      : active
                      ? 'bg-indigo-100 border-2 border-indigo-600 text-indigo-600'
                      : 'bg-bg border-2 border-token-strong text-fg-subtle'
                  }`}>
                    {done ? (
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : step}
                  </div>
                  {idx < stepLabels.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 ${done ? 'bg-indigo-600' : 'bg-surface-2'}`} />
                  )}
                </div>
                <span className={`mt-1.5 text-xs hidden sm:block text-center leading-tight w-full ${
                  done ? 'text-fg-muted' : active ? 'text-indigo-600 font-semibold' : 'text-fg-subtle'
                }`}>
                  {label}
                </span>
              </div>
            )
          })}
        </div>



        <div className="flex flex-col gap-3">
          {/* 标题行 + 按钮组 */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight">{event.name}</h1>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                <Badge variant="outline" className="text-xs whitespace-nowrap">
                  {isPanelMode ? t('event.mode.panel') : t('event.mode.ai')}
                </Badge>
              </div>
              {event.status !== 'draft' && (
                <div className="mt-3 max-w-xl">
                  <EventStatusStepper status={event.status} />
                </div>
              )}
              {isCancelled && (
                <div
                  className="mt-3 rounded-md px-3 py-2 text-sm"
                  style={{
                    background: 'color-mix(in oklab, var(--color-danger) 10%, var(--color-bg))',
                    borderLeft: '3px solid var(--color-danger)',
                    color: 'var(--color-fg)',
                  }}
                >
                  {t('event.status.cancelled')}
                  {event.cancelled_reason ? `：${event.cancelled_reason}` : ''}
                </div>
              )}
              {event.track && (
                <p className="text-sm text-muted-foreground mt-1">{event.track}</p>
              )}
              <div className="mt-1">
                <Link
                  href={`/events/public/${id}`}
                  target="_blank"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit"
                >
                  <ExternalLink size={11} />
                  {t('events.access.viewPublic')}
                </Link>
              </div>
              {mounted && event.registration_config?.open && event.registration_deadline && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock size={11} />
                  {t('reg.deadline')}{t('reg.deadlineSeparator')}{formatDeadline(event.registration_deadline, locale)}
                  {new Date(event.registration_deadline) < new Date() && (
                    <span className="text-red-500 ml-1">({t('reg.closed')})</span>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {/* Status transition action buttons (hidden when event is cancelled) */}
            {!isCancelled && event.status === 'draft' && (
              <Button
                size="sm"
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={statusLoading}
                onClick={() => handleStatusAction('publish')}
              >
                {statusLoading
                  ? <><Loader2 size={14} className="animate-spin" />{t('event.action.publishing')}</>
                  : t('event.action.publish')}
              </Button>
            )}
            {!isCancelled && event.status === 'recruiting' && (
              <Button
                size="sm"
                className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                disabled={statusLoading}
                onClick={() => handleStatusAction('close_registration')}
              >
                {statusLoading
                  ? <><Loader2 size={14} className="animate-spin" />{t('event.action.publishing')}</>
                  : t('event.action.closeRegistration')}
              </Button>
            )}
            {!isCancelled && event.status === 'hacking' && (
              <Button
                size="sm"
                className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                disabled={statusLoading}
                onClick={() => handleStatusAction('start_review')}
              >
                {statusLoading
                  ? <><Loader2 size={14} className="animate-spin" />{t('event.action.publishing')}</>
                  : t('event.action.startReview')}
              </Button>
            )}
            {!isCancelled && event.status === 'judging' && (
              <Button
                size="sm"
                className="gap-1.5 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                disabled={statusLoading || !canPublishResult}
                title={!canPublishResult ? t('event.action.publishResultTip') : undefined}
                onClick={() => handleStatusAction('publish_result')}
              >
                {statusLoading
                  ? <><Loader2 size={14} className="animate-spin" />{t('event.action.publishing')}</>
                  : t('event.action.publishResult')}
              </Button>
            )}
            {!isCancelled && event.status !== 'done' && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                style={{
                  color: 'var(--color-danger)',
                  borderColor: 'var(--color-danger)',
                }}
                disabled={cancelling}
                onClick={() => setCancelDialogOpen(true)}
              >
                <Trash2 size={14} />
                {t('event.action.cancel')}
              </Button>
            )}
            <Link href={`/events/${id}/registrations`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <ClipboardList size={14} />
                {t('reg.manage')}
              </Button>
            </Link>
            <Link href={`/events/${id}/teams`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <UsersRound size={14} />
                {t('eventDetail.teamsButton')}
              </Button>
            </Link>
            <Link href={`/events/${id}/vote-config`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Vote size={14} />
                {t('vote.configBtn')}
              </Button>
            </Link>
            {event.status === 'done' && (
              <Link href={`/report/${event.id}`} target="_blank">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink size={14} />
                  {t('event.viewReport')}
                </Button>
              </Link>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={openEdit}>
              <Pencil size={14} />
              {t('event.edit')}
            </Button>
            {!isCancelled && event.status !== 'done' && (
              <>
                <Link href={`/events/${id}/import`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Upload size={14} />
                    {t('event.importProjects')}
                  </Button>
                </Link>
                {event.status === 'judging' && !isPanelMode && (
                  <Link href={`/events/${id}/review`}>
                    <Button size="sm" className="gap-1.5">
                      <Play size={14} />
                      {t('event.viewProgress')}
                    </Button>
                  </Link>
                )}
                {projects.length > 0 && event.status !== 'judging' && !isPanelMode && (
                  <Link href={`/events/${id}/review`}>
                    <Button size="sm" className="gap-1.5">
                      <Play size={14} />
                      {t('event.startReview')}
                    </Button>
                  </Link>
                )}
                {projects.length > 0 && isPanelMode && (
                  <>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReviewerSheetOpen(true)}>
                      <Users size={14} />
                      {t('event.reviewerManage')}
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      className={`gap-1.5 ${preAnalyzeStatus?.ready ? 'text-emerald-600 border-emerald-300' : ''}`}
                      disabled={preAnalyzing || workerPolling}
                      onClick={async () => {
                        if (preAnalyzeStatus?.ready) return
                        setCreditsLoading(true)
                        try {
                          const res = await fetch('/api/credits')
                          const data = await res.json()
                          setCurrentCredits(typeof data.credits === 'number' ? data.credits : null)
                        } catch {
                          setCurrentCredits(null)
                        } finally {
                          setCreditsLoading(false)
                        }
                        setCreditsDialogOpen(true)
                      }}
                    >
                      {preAnalyzing ? <><Loader2 size={14} className="animate-spin" />{t('event.preAnalyzeSubmitting')}</> :
                       preAnalyzeStatus?.ready ? <><CheckCircle2 size={14} />{t('event.preAnalyzeDone')}</> :
                       workerPolling ? <><Loader2 size={14} className="animate-spin" />{t('event.preAnalyzing')} ({preAnalyzeStatus?.completed ?? 0}/{preAnalyzeStatus?.total ?? '?'})</> :
                       preAnalyzeStatus?.running && preAnalyzeStatus.running > 0 ? <><Loader2 size={14} className="animate-spin" />{t('event.preAnalyzing')} ({preAnalyzeStatus.completed}/{preAnalyzeStatus.total})</> :
                       preAnalyzeStatus ? <><Bot size={14} />{t('event.batchPreAnalyze')} ({preAnalyzeStatus.completed}/{preAnalyzeStatus.total})</> :
                       <><Bot size={14} />{t('event.batchPreAnalyze')}</>}
                    </Button>
                    <Link href={`/events/${id}/panel`}>
                      <Button size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white">
                        <Trophy size={14} />
                        {t('event.reviewResult')}
                      </Button>
                    </Link>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Banner management */}
      <Card className="mb-4">
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(280px,420px)_1fr] lg:items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-fg">
              <ImageIcon size={14} className="text-fg-muted" />
              {t('event.banner.title')}
            </div>
            <EventCover
              src={event.banner_url}
              className="rounded-lg bg-surface-2 border border-token shadow-sm"
              fallback={<p className="text-sm text-muted-foreground">{t('event.banner.empty')}</p>}
              fallbackClassName="border border-dashed border-token"
            />
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="banner-prompt" className="text-xs text-muted-foreground">
                {t('event.banner.aiLabel')}
              </Label>
              <Textarea
                id="banner-prompt"
                placeholder={t('event.banner.aiPlaceholder')}
                value={bannerPrompt}
                onChange={e => setBannerPrompt(e.target.value)}
                rows={2}
                maxLength={400}
                disabled={generatingBanner || bannerUsed >= BANNER_QUOTA}
                className="text-sm resize-none"
              />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  type="button"
                  disabled={generatingBanner || applyingBanner || bannerUsed >= BANNER_QUOTA}
                  onClick={handleGenerateBanner}
                >
                  {generatingBanner ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      {t('event.banner.generating')}
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      {t('event.banner.generate')}
                    </>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {bannerUsed >= BANNER_QUOTA
                    ? `${t('event.banner.quotaReached')} (${bannerUsed}/${BANNER_QUOTA})`
                    : `${t('event.banner.quotaRemaining')} ${BANNER_QUOTA - bannerUsed} · ${t('event.banner.quotaPerEvent')} ${BANNER_QUOTA}${t('event.banner.quotaPerEventSuffix')}`}
                </span>
              </div>
            </div>

            {generatedBannerUrl && generatedBannerUrl !== event.banner_url && (
              <div className="rounded-lg border border-token p-3 space-y-3 bg-surface">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-fg-muted">{t('event.banner.preview')}</p>
                  <span className="text-[11px] text-muted-foreground">
                    {t('event.banner.previewHint')}
                  </span>
                </div>
                <div className="w-full max-w-[360px] aspect-[16/9] rounded overflow-hidden bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={generatedBannerUrl} alt={t('event.banner.preview')} className="w-full h-full object-cover" />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    onClick={handleApplyBanner}
                    disabled={applyingBanner}
                    className="gap-1.5"
                  >
                    {applyingBanner ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        {t('event.banner.applying')}
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} />
                        {t('event.banner.apply')}
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setGeneratedBannerUrl(null)}
                    disabled={applyingBanner}
                  >
                    {t('event.banner.discard')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">{t('event.stat.totalProjects')}</p>
            <p className="text-2xl font-bold">{projects.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">{isPanelMode ? t('event.stat.reviewers') : t('event.stat.models')}</p>
            <p className="text-2xl font-bold">{isPanelMode ? reviewers.length : event.models.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">{t('event.stat.dimensions')}</p>
            <p className="text-2xl font-bold">{event.dimensions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">{isPanelMode ? t('event.stat.mode') : t('event.stat.credits')}</p>
            <p className="text-2xl font-bold">{isPanelMode ? t('event.stat.modePanel') : Math.ceil(creditCost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Models & Dimensions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {!isPanelMode && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t('event.models')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {event.models.map(model => (
                <span
                  key={model}
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${MODEL_COLORS[model] || 'bg-surface-2 text-fg'}`}
                >
                  {MODEL_NAMES[model] || model}
                </span>
              ))}
              {event.web3_enabled && (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800">
                  {t('event.web3Insight')}
                </span>
              )}
            </CardContent>
          </Card>
        )}
        <Card className={isPanelMode ? 'md:col-span-2' : ''}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t('event.dimensions')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {event.dimensions.map(dim => (
                <span
                  key={dim.name}
                  className="inline-flex items-center rounded-md px-2 py-0.5 text-xs bg-surface-2 text-fg-muted"
                >
                  {dim.name} {dim.weight}%
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reviewer Management Sheet (panel_review mode only) */}
      {isPanelMode && (
        <Sheet open={reviewerSheetOpen} onOpenChange={setReviewerSheetOpen}>
          <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto bg-bg text-fg">
            <SheetHeader className="mb-4">
              <SheetTitle className="flex items-center gap-2">
                <UserCheck size={16} />
                {t('reviewer.sheet.title')}
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-4">
              {/* Invite reviewer */}
              <div className="flex gap-2">
                <Input
                  placeholder={t('reviewer.sheet.emailPlaceholder')}
                  value={searchEmail}
                  onChange={e => setSearchEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearchUser()}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSearchUser}
                  disabled={searching || !searchEmail.trim()}
                >
                  <Search size={14} />
                </Button>
              </div>

              {searchResult && (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-surface">
                  <div>
                    <p className="text-sm font-medium">{searchResult.email}</p>
                    <p className="text-xs text-muted-foreground">{t('reviewer.sheet.registeredUser')}</p>
                  </div>
                  <Button size="sm" onClick={handleInviteReviewer} disabled={inviting}>
                    {inviting ? t('reviewer.sheet.inviting') : t('reviewer.sheet.invite')}
                  </Button>
                </div>
              )}

              {userNotFound && (
                <div className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50">
                  <div>
                    <p className="text-sm font-medium">{searchEmail.trim()}</p>
                    <p className="text-xs text-amber-600">{t('reviewer.sheet.unregistered')}</p>
                  </div>
                  <Button size="sm" onClick={handleInviteReviewer} disabled={inviting}>
                    {inviting ? t('reviewer.sheet.sending') : t('reviewer.sheet.sendInvite')}
                  </Button>
                </div>
              )}

              {/* Reviewer list */}
              {loadingReviewers ? (
                <p className="text-sm text-muted-foreground">{t('reviewer.sheet.loadingList')}</p>
              ) : reviewers.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('reviewer.sheet.noReviewers')}</p>
              ) : (
                <div className="space-y-2">
                  {reviewers.map(reviewer => (
                    <div key={reviewer.id} className="flex items-center justify-between p-2.5 rounded border gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Users size={14} className="text-fg-subtle shrink-0" />
                        <span className="text-sm truncate">{reviewer.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {reviewer.status !== 'invite_pending' && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {reviewer.scored}/{reviewer.total}
                          </span>
                        )}
                        {reviewer.status === 'done' ? (
                          <CheckCircle2 size={14} className="text-green-500" />
                        ) : reviewer.status === 'in_progress' ? (
                          <Clock size={14} className="text-blue-500" />
                        ) : reviewer.status === 'invite_pending' ? (
                          <Clock size={14} className="text-amber-400" />
                        ) : (
                          <Clock size={14} className="text-fg-subtle" />
                        )}
                        <Badge
                          variant={reviewer.status === 'done' ? 'outline' : 'secondary'}
                          className="text-xs whitespace-nowrap"
                        >
                          {reviewer.status === 'done' ? t('reviewer.sheet.statusDone')
                            : reviewer.status === 'in_progress' ? t('reviewer.sheet.statusInProgress')
                            : reviewer.status === 'invite_pending' ? t('reviewer.sheet.statusInvitePending')
                            : t('reviewer.sheet.statusPending')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reviewer page link */}
              <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                <p className="font-medium text-fg-muted mb-1">{t('reviewer.sheet.reviewerPage')}</p>
                <p>{t('reviewer.sheet.reviewerPageDesc')}</p>
                <Link
                  href={`/events/${id}/reviewer`}
                  className="text-blue-600 hover:underline break-all"
                >
                  /events/{id}/reviewer
                </Link>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Projects Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>{t('event.projects')}</CardTitle>
            <Link href={`/events/${id}/import`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Upload size={14} />
                {t('event.importProjects')}
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {projects.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Upload size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t('event.noProjects')}</p>
              <Link href={`/events/${id}/import`}>
                <Button variant="outline" size="sm" className="mt-3 gap-1.5">
                  <Upload size={14} />
                  {t('event.importProjects')}
                </Button>
              </Link>
            </div>
          ) : (() => {
              // Determine which optional columns to show based on column_mapping
              const mapping = event?.column_mapping ?? {}
              // __labels__: fieldKey → user label (set during import mapping)
              const labels = (mapping.__labels__ ?? {}) as Record<string, string>
              const showTeam = !!mapping.team_name || projects.some(p => p.team_name?.trim())
              const showTags = false // 隐藏 tags 列，赛道信息已在 track_ids 列展示
              const showDemo = !!mapping.demo_url || projects.some(p => p.demo_url)
              const showPitch = projects.some(p => p.pitch_url)
              // Header: user label > CSV column name > default
              const headerName = labels.name || mapping.name || t('project.header.name')
              const headerTeam = labels.team_name || mapping.team_name || t('project.header.team')
              const headerTags = labels.tags || mapping.tags || t('project.header.tags')

              // Collect extra_fields keys that appear across projects (max 3 columns to avoid overflow)
              const extraKeys: string[] = []
              for (const p of projects) {
                if (p.extra_fields) {
                  for (const k of Object.keys(p.extra_fields)) {
                    if (!extraKeys.includes(k)) extraKeys.push(k)
                  }
                }
              }
              const visibleExtraKeys = extraKeys.slice(0, 3)

              // Helper: detect URL (kept for server-side use if needed)
              const _isUrl = (v: string) => /^https?:\/\//i.test(v?.trim() ?? '')
              void _isUrl
              return (
            <ProjectsTable
              eventId={event?.id ?? id}
              eventStatus={event?.status}
              initialProjects={projects}
              headerName={headerName}
              headerTeam={headerTeam}
              headerTags={headerTags}
              showTeam={showTeam}
              showTags={showTags}
              showDemo={showDemo}
              showPitch={showPitch}
              visibleExtraKeys={visibleExtraKeys}
              isOwner={!!event}
              fieldLabels={labels}
              tracks={event?.tracks ?? []}
            />
              )
            })()
          }
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-bg text-fg [&_input]:bg-surface-2 [&_input]:text-fg [&_textarea]:bg-surface-2 [&_textarea]:text-fg">
          <DialogHeader>
            <DialogTitle>{t('edit.title')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Banner */}
            <div className="space-y-1.5">
              <ImageUpload
                value={editBannerUrl || null}
                onChange={url => setEditBannerUrl(url)}
                bucket="event-banners"
                path={id}
                label={t('upload.banner')}
                aspectRatio="banner"
              />
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">
                {t('edit.name')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="e.g. 2024 Web3 Hackathon"
              />
            </div>

            {/* Track */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-track">{t('edit.track')}</Label>
              <Input
                id="edit-track"
                value={editTrack}
                onChange={e => setEditTrack(e.target.value)}
                placeholder="e.g. DeFi, Infrastructure, AI + Crypto"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-desc">{t('edit.desc')}</Label>
              <Textarea
                id="edit-desc"
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                rows={3}
              />
            </div>

            {/* Tracks */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('track.labelOptional')}</Label>
              </div>
              <div className="space-y-2">
                {editTracks.map((tr, idx) => (
                  <div key={tr.id} className="rounded-lg border p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Input
                        value={tr.name}
                        onChange={e => updateEditTrack(idx, 'name', e.target.value)}
                        placeholder={t('track.placeholder')}
                        className="flex-1 h-7 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeEditTrack(idx)}
                        className="text-fg-subtle hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Input
                        value={tr.description ?? ''}
                        onChange={e => updateEditTrack(idx, 'description', e.target.value)}
                        placeholder={t('track.descOptional')}
                        className="h-6 text-xs"
                      />
                      <Input
                        value={tr.prize ?? ''}
                        onChange={e => updateEditTrack(idx, 'prize', e.target.value)}
                        placeholder={t('track.prizeOptional')}
                        className="h-6 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 w-full" onClick={addEditTrack}>
                <Plus size={14} />
                {t('track.add')}
              </Button>
            </div>

            {/* Dimensions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('edit.dimensions')}</Label>
                <span className={`text-xs font-medium ${totalEditWeight === 100 ? 'text-green-600' : 'text-red-500'}`}>
                  {t('edit.weightTotal')}{totalEditWeight}%
                </span>
              </div>
              <div className="space-y-2">
                {editDimensions.map((dim, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={dim.name}
                      onChange={e => updateDimName(index, e.target.value)}
                      placeholder={t('edit.dimNamePlaceholder')}
                      className="flex-1 h-8 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={dim.weight}
                      onChange={e => updateDimWeight(index, parseInt(e.target.value) || 0)}
                      className="w-[60px] border rounded px-2 py-1 text-sm text-right bg-background text-foreground"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                    <button
                      type="button"
                      onClick={() => removeDim(index)}
                      disabled={editDimensions.length <= 1}
                      className="text-fg-subtle hover:text-red-500 transition-colors disabled:opacity-30"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 w-full" onClick={addDim}>
                <Plus size={14} />
                {t('edit.addDimension')}
              </Button>
            </div>

            {/* Models (only for ai_only mode) */}
            {!isPanelMode && (
              <div className="space-y-2">
                <Label>{t('edit.reviewModels')}</Label>
                <div className="space-y-2">
                  {Object.keys(MODEL_CREDITS).map(model => (
                    <label key={model} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editModels.includes(model)}
                        onChange={() => toggleModel(model)}
                        className="h-4 w-4 rounded border-token-strong"
                      />
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${MODEL_COLORS[model] || 'bg-surface-2 text-fg'}`}>
                        {MODEL_NAMES[model] || model}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {MODEL_CREDITS[model]} {t('common.credits')}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Web3 (only for ai_only mode) */}
            {!isPanelMode && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{t('edit.web3Mode')}</p>
                  <p className="text-xs text-muted-foreground">{t('edit.web3ModeDesc')}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={editWeb3}
                  onClick={() => setEditWeb3(v => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editWeb3 ? 'bg-[var(--color-fg)]' : 'bg-surface-2'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-bg transition-transform ${editWeb3 ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </button>
              </div>
            )}
            {!isPanelMode && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{t('event.sonar.title')}</p>
                  <p className="text-xs text-muted-foreground">{t('event.sonar.desc')}</p>
                </div>
                <button type="button" role="switch" aria-checked={editSonar}
                  onClick={() => setEditSonar(v => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editSonar ? 'bg-[var(--color-fg)]' : 'bg-surface-2'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-bg transition-transform ${editSonar ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              {t('edit.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={editSaving}>
              {editSaving ? t('edit.saving') : t('edit.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Event Confirm Dialog */}
      <Dialog
        open={cancelDialogOpen}
        onOpenChange={open => {
          if (!cancelling) {
            setCancelDialogOpen(open)
            if (!open) setCancelReason('')
          }
        }}
      >
        <DialogContent className="max-w-sm bg-bg text-fg">
          <DialogHeader>
            <DialogTitle>{t('event.cancel.dialogTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm py-2">
            <p className="text-fg-muted">{t('event.cancel.dialogDesc')}</p>
            <div className="space-y-1.5">
              <Label htmlFor="cancel-reason" className="text-xs text-muted-foreground">
                {t('event.cancel.reasonLabel')}
              </Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder={t('event.cancel.reasonPlaceholder')}
                rows={3}
                maxLength={500}
                disabled={cancelling}
                className="text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={cancelling}
              onClick={() => {
                setCancelDialogOpen(false)
                setCancelReason('')
              }}
            >
              {t('event.cancel.keep')}
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-white hover:opacity-90"
              style={{ background: 'var(--color-danger)' }}
              disabled={cancelling}
              onClick={handleCancelEvent}
            >
              {cancelling ? (
                <><Loader2 size={14} className="animate-spin" />{t('event.action.cancelling')}</>
              ) : (
                <><Trash2 size={14} />{t('event.cancel.confirm')}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credits Confirm Dialog */}
      {event && (
        <Dialog open={creditsDialogOpen} onOpenChange={setCreditsDialogOpen}>
          <DialogContent className="max-w-sm bg-bg text-fg">
            <DialogHeader>
              <DialogTitle>{t('event.credits.dialogTitle')}</DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-3 text-sm">
              {creditsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{t('event.credits.loadingCredits')}</span>
                </div>
              ) : (() => {
                const projectCount = projects.length
                const modelCount = event.models.length
                const creditsPerJob = 2
                const estimated = projectCount * modelCount * creditsPerJob
                const insufficient = currentCredits !== null && currentCredits < estimated
                return (
                  <>
                    <p className="text-fg-muted">
                      {t('event.credits.summary')
                        .replace('{projects}', String(projectCount))
                        .replace('{estimated}', String(estimated))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('event.credits.breakdown')
                        .replace('{projects}', String(projectCount))
                        .replace('{models}', String(modelCount))
                        .replace('{each}', String(creditsPerJob))}
                    </p>
                    <p className="text-fg-muted">
                      {t('event.credits.remaining')}
                      <span className={`font-semibold ${insufficient ? 'text-red-600' : 'text-emerald-600'}`}>
                        {' '}
                        {currentCredits !== null ? currentCredits : '—'} {t('event.credits.unit')}
                      </span>
                    </p>
                    {insufficient && (
                      <p className="text-red-600 text-xs font-medium">
                        {t('event.credits.insufficient')}
                      </p>
                    )}
                    <DialogFooter className="pt-2">
                      <Button variant="outline" size="sm" onClick={() => setCreditsDialogOpen(false)}>
                        {t('common.cancel')}
                      </Button>
                      <Button
                        size="sm"
                        disabled={insufficient || preAnalyzing}
                        onClick={async () => {
                          setCreditsDialogOpen(false)
                          setPreAnalyzing(true)
                          try {
                            const res = await fetch(`/api/events/${id}/enqueue`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ models: event.models, sonarEnabled: editSonar }),
                            })
                            if (!res.ok) {
                              const err = await res.json().catch(() => ({}))
                              toast.error(err.error || t('event.enqueueFailed'))
                              return
                            }
                            const { enqueued } = await res.json()
                            toast.info(t('event.enqueueSuccess').replace('{n}', String(enqueued)))
                            const st = await fetch(`/api/events/${id}/batch-preanalyze`).then(r => r.json())
                            setPreAnalyzeStatus(st)
                            setWorkerPolling(true)
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : t('event.enqueueFailed'))
                          } finally {
                            setPreAnalyzing(false)
                          }
                        }}
                      >
                        {t('event.credits.confirm')}
                      </Button>
                    </DialogFooter>
                  </>
                )
              })()}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
