'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useRouter, useSearchParams } from 'next/navigation'
import { parseCSV, parseCSVWithMapping, generateCSVTemplate, type ProjectCSVRow } from '@/lib/csv'

// RFC 4180 CSV row splitter (reuses lib logic for header/sample extraction)
function parseCsvRowsForPreview(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 2 }
      else if (ch === '"') { inQuotes = false; i++ }
      else { field += ch; i++ }
    } else {
      if (ch === '"') { inQuotes = true; i++ }
      else if (ch === ',') { row.push(field); field = ''; i++ }
      else if (ch === '\r') { row.push(field); field = ''; rows.push(row); row = []; i++; if (src[i] === '\n') i++ }
      else if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++ }
      else { field += ch; i++ }
    }
  }
  if (field || row.length > 0) { row.push(field); if (row.some(f => f !== '')) rows.push(row) }
  return rows
}

// Column mapping type (inlined to avoid importing from API route)
type ColumnMapping = {
  name: string | null
  github_url: string | null
  description: string | null
  demo_url: string | null
  team_name: string | null
  tags: string | null
}
type Track = {
  id: string
  name: string
  description?: string
  prize?: string
}
import { MODEL_NAMES } from '@/lib/models'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { Upload, Download, Plus, X, ArrowLeft, Trash2, Check, AlertCircle, Loader2, ChevronDown, CheckCircle, Activity } from 'lucide-react'
import Link from 'next/link'
import { useT } from '@/lib/i18n'

// Base credits per model (calibrated for ~500 char descriptions)
const MODEL_CREDITS_BASE: Record<string, number> = {
  deepseek: 1, minimax: 1, gemini: 2, glm: 3, kimi: 3, gpt4o: 12, claude: 16,
}

// Dynamic credit multiplier based on average description length
// ≤500 chars: 1x | 500-2000: 1.5x | 2000-5000: 2x | 5000+: 3x
function descLengthMultiplier(avgLen: number): number {
  if (avgLen <= 500) return 1
  if (avgLen <= 2000) return 1.5
  if (avgLen <= 5000) return 2
  return 3
}

function avgDescLength(projects: ProjectCSVRow[]): number {
  if (projects.length === 0) return 0
  return projects.reduce((sum, p) => sum + (p.description?.length ?? 0), 0) / projects.length
}

function modelCredits(modelKey: string, multiplier: number): number {
  const base = MODEL_CREDITS_BASE[modelKey] ?? 1
  return Math.ceil(base * multiplier)
}

// Keep old constant map for legacy usage
const MODEL_CREDITS: Record<string, number> = MODEL_CREDITS_BASE

const AVAILABLE_MODELS = Object.entries(MODEL_NAMES).map(([key, name]) => ({ key, name }))

type DetectState =
  | { status: 'idle' }
  | { status: 'detecting' }
  | { status: 'done'; headers: string[] }
  | { status: 'error'; message: string }

type FieldRow = { id: string; label: string; csvColumn: string | null; isRequired: boolean; fieldKey?: string }

export default function ImportPage() {
  const params = useParams()
  const eventId = params.id as string
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useT()

  // CSV state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const analyzeRef = useRef<HTMLDivElement>(null)
  const [csvText, setCsvText] = useState('')
  const [parsedProjects, setParsedProjects] = useState<ProjectCSVRow[]>([])
  const [parseErrors, setParseErrors] = useState<Array<{ row: number; message: string }>>([])
  const [fileName, setFileName] = useState('')
  const [detectState, setDetectState] = useState<DetectState>({ status: 'idle' })
  const [fieldRows, setFieldRows] = useState<FieldRow[]>([])
  const [savedMapping, setSavedMapping] = useState<Record<string, string | null>>({})

  // Manual entry state
  const [manualName, setManualName] = useState('')
  const [manualGithub, setManualGithub] = useState('')
  const [manualDemo, setManualDemo] = useState('')
  const [manualDesc, setManualDesc] = useState('')
  const [manualTeam, setManualTeam] = useState('')
  const [manualTags, setManualTags] = useState('')
  const [manualProjects, setManualProjects] = useState<ProjectCSVRow[]>([])

  const [saving, setSaving] = useState(false)
  const [importDone, setImportDone] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [userCredits, setUserCredits] = useState<number | null>(null)
  const [loadingCredits, setLoadingCredits] = useState(false)
  const [isLoadingPage, setIsLoadingPage] = useState(true)
  // Analysis progress
  const [analyzingTotal, setAnalyzingTotal] = useState(0)
  const [analyzingDone, setAnalyzingDone] = useState(0)
  const [analyzingActive, setAnalyzingActive] = useState(false)
  const [eventDimensions, setEventDimensions] = useState<Array<{ name: string; description?: string }>>([])
  const [eventTracks, setEventTracks] = useState<Track[]>([])
  const [trackCsvLabel, setTrackCsvLabel] = useState<string>('')

  // Model config state
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [web3Enabled, setWeb3Enabled] = useState(false)
  const [sonarEnabled, setSonarEnabled] = useState(false)
  const [dimExpanded, setDimExpanded] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)

  // On mount: check if this event already has imported projects
  useEffect(() => {
    if (!eventId) return
    const p1 = fetch(`/api/events/${eventId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.dimensions)) setEventDimensions(data.dimensions)
        if (Array.isArray(data.models) && data.models.length > 0) setSelectedModels(data.models)
        if (data.web3_enabled) setWeb3Enabled(true)
        if (data.column_mapping) setSavedMapping(data.column_mapping)
        if (Array.isArray(data.tracks)) setEventTracks(data.tracks)
      })
      .catch(() => {})
    const p2 = fetch(`/api/events/${eventId}/projects`)
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : (data.projects ?? [])
        const count = arr.length
        if (count > 0) {
          setImportedCount(count)
          setImportDone(true)
          fetch(`/api/events/${eventId}/credit-check`)
            .then(r => r.json())
            .then(d => setUserCredits(d.credits ?? null))
            .catch(() => {})
        }
      })
      .catch(() => {})
    Promise.all([p1, p2]).finally(() => setIsLoadingPage(false))
  }, [eventId])

  // Auto-scroll to analyze section if ?tab=analyze
  useEffect(() => {
    if (searchParams.get('tab') === 'analyze' && analyzeRef.current) {
      setTimeout(() => {
        analyzeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 500)
    }
  }, [searchParams, analyzeRef])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setParsedProjects([])
    setParseErrors([])
    setDetectState({ status: 'idle' })

    const rawText = await file.text()
    const text = rawText.replace(/^\uFEFF/, '')
    setCsvText(text)

    // Extract headers and first 3 data rows using RFC 4180 parser
    const allRows = parseCsvRowsForPreview(text)
    if (allRows.length === 0) {
      toast.error(t('import.fileEmpty'))
      return
    }

    const headers = allRows[0].map(h => h.trim()).filter(h => h !== '')
    const sampleRows = allRows.slice(1, 4).map(r => r.map(c => c.trim()))

    setDetectState({ status: 'detecting' })

    try {
      const res = await fetch('/api/csv-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers, sampleRows }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: t('import.unknownError') }))
        throw new Error(err.error ?? t('import.aiDetectFailed'))
      }

      const { mapping } = await res.json() as { mapping: ColumnMapping }
      // Normalize: ensure all values are string | null (never undefined)
      const m: ColumnMapping = {
        name: mapping.name ?? null,
        github_url: mapping.github_url ?? null,
        description: mapping.description ?? null,
        demo_url: mapping.demo_url ?? null,
        team_name: mapping.team_name ?? null,
        tags: mapping.tags ?? null,
      }
      setDetectState({ status: 'done', headers })
      setFieldRows([
        { id: 'name', label: t('import.field.name'), csvColumn: m.name, isRequired: true, fieldKey: 'name' },
        { id: 'github_url', label: t('import.field.github'), csvColumn: m.github_url, isRequired: true, fieldKey: 'github_url' },
        { id: 'description', label: t('import.field.desc'), csvColumn: m.description, isRequired: true, fieldKey: 'description' },
        { id: 'demo_url', label: t('import.field.demo'), csvColumn: m.demo_url, isRequired: false, fieldKey: 'demo_url' },
        { id: 'team_name', label: t('import.field.team'), csvColumn: m.team_name, isRequired: false, fieldKey: 'team_name' },
        ...(eventTracks.length > 0 ? [{ id: 'track_ids', label: t('import.field.track'), csvColumn: null, isRequired: false, fieldKey: 'track_ids' }] : []),
      ])
    } catch (err) {
      // Fallback to keyword matching
      const message = err instanceof Error ? err.message : t('import.aiDetectFailed')
      setDetectState({ status: 'error', message })
      const result = parseCSV(text)
      setParsedProjects(result.valid)
      setParseErrors(result.errors)
      toast.warning(t('import.detectFallbackToast').replace('{message}', message))
    }
  }

  const handleConfirmImport = () => {
    if (detectState.status !== 'done') return
    const STANDARD_KEYS = new Set(['name', 'github_url', 'description', 'demo_url', 'team_name'])
    const stdMapping: Record<string, string | null> = {}
    const extraMapping: Record<string, string> = {}
    // labels: fieldKey → user-defined label (left side of mapping UI)
    const labelsMapping: Record<string, string> = {}
    for (const row of fieldRows) {
      if (!row.label.trim() || !row.csvColumn) continue
      const key = row.fieldKey || row.label.trim()
      if (STANDARD_KEYS.has(key)) {
        stdMapping[key] = row.csvColumn
        labelsMapping[key] = row.label.trim()
      } else {
        extraMapping[row.label.trim()] = row.csvColumn
      }
    }
    // Find track_id field row for special handling
    const trackRow = fieldRows.find(r => r.fieldKey === 'track_ids')
    const trackLabel = trackRow?.label?.trim() || ''
    const trackCsvCol = trackRow?.csvColumn || null
    if (trackLabel && trackCsvCol) {
      extraMapping[trackLabel] = trackCsvCol
      setTrackCsvLabel(trackLabel)
    } else {
      setTrackCsvLabel('')
    }
    const fullMapping = {
      ...stdMapping,
      extra: Object.keys(extraMapping).length > 0 ? extraMapping : undefined,
      __labels__: Object.keys(labelsMapping).length > 0 ? labelsMapping : undefined,
    }
    setSavedMapping({ ...stdMapping, __labels__: labelsMapping as unknown as string | null } as unknown as Record<string, string | null>)
    const result = parseCSVWithMapping(csvText, fullMapping as unknown as ColumnMapping)
    // Post-process: convert raw track name → track_id
    const lbl = trackLabel
    if (lbl && eventTracks.length > 0) {
      result.valid = result.valid.map(p => {
        const rawName = p.extra_fields?.[lbl]
        let track_ids: string[] = []
        if (rawName) {
          // Support comma/semicolon separated multiple track names
          const names = rawName.split(/[,;、]/).map((s: string) => s.trim()).filter(Boolean)
          track_ids = names.map((name: string) => {
            const lower = name.toLowerCase()
            const match = eventTracks.find(t =>
              t.name.toLowerCase() === lower ||
              t.name.toLowerCase().includes(lower) ||
              lower.includes(t.name.toLowerCase())
            )
            return match?.id ?? null
          }).filter((id): id is string => id !== null)
        }
        const { [lbl]: _removed, ...restExtra } = p.extra_fields ?? {}
        void _removed
        return { ...p, track_ids, extra_fields: Object.keys(restExtra).length > 0 ? restExtra : undefined }
      })
    }
    setParsedProjects(result.valid)
    setParseErrors(result.errors)
    if (result.valid.length > 0) toast.success(t('import.parseSuccess').replace('{n}', String(result.valid.length)))
    if (result.errors.length > 0) toast.error(t('import.parseError').replace('{n}', String(result.errors.length)))
  }

  const handleDownloadTemplate = () => {
    const csv = generateCSVTemplate()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hackagent_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAddManual = () => {
    if (!manualName.trim()) { toast.error(t('import.manual.nameRequired')); return }
    if (!manualGithub.trim()) { toast.error(t('import.manual.githubRequired')); return }
    if (!manualDesc.trim()) { toast.error(t('import.manual.descRequired')); return }
    if (manualDesc.length > 500) { toast.error(t('import.manual.descTooLong')); return }

    setManualProjects(prev => [
      ...prev,
      {
        name: manualName.trim(),
        github_url: manualGithub.trim(),
        demo_url: manualDemo.trim() || undefined,
        description: manualDesc.trim(),
        team_name: manualTeam.trim() || undefined,
        tags: manualTags.trim() || undefined,
      },
    ])
    setManualName(''); setManualGithub(''); setManualDemo('')
    setManualDesc(''); setManualTeam(''); setManualTags('')
    toast.success(t('import.manual.addedToList'))
  }

  const removeManualProject = (index: number) => {
    setManualProjects(prev => prev.filter((_, i) => i !== index))
  }

  const startBatchAnalysis = async () => {
    if (selectedModels.length === 0) {
      toast.error(t('import.modelRequired'))
      return
    }

    // Save config first
    await fetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ models: selectedModels, web3_enabled: web3Enabled }),
    })

    const res = await fetch(`/api/events/${eventId}/projects`)
    if (!res.ok) return
    const raw = await res.json()
    const projects: Array<{ id: string; github_url: string | null; analysis_status: string | null }> =
      Array.isArray(raw) ? raw : (raw.projects ?? [])

    // Filter: only projects not fully done
    const toAnalyze = projects.filter(p => p.analysis_status !== 'done')
    if (toAnalyze.length === 0) {
      toast.success(t('import.allAnalyzed'))
      return
    }

    setAnalyzingTotal(toAnalyze.length)
    setAnalyzingDone(0)
    setAnalyzingActive(true)

    // Get current event dimensions
    const eventRes = await fetch(`/api/events/${eventId}`)
    const eventData = eventRes.ok ? await eventRes.json() : {}
    const dimensions = Array.isArray(eventData.dimensions) ? eventData.dimensions : eventDimensions

    for (const project of toAnalyze) {
      try {
        await fetch(`/api/projects/${project.id}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            models: selectedModels,
            dimensions,
            web3_enabled: web3Enabled,
            sonar_enabled: sonarEnabled,
          }),
        })
      } catch {
        // ignore individual failures, continue
      }
      setAnalyzingDone(prev => prev + 1)
    }

    setAnalyzingActive(false)
    toast.success(t('import.analysisComplete').replace('{n}', String(toAnalyze.length)))

    // Deduct credits
    await fetch(`/api/events/${eventId}/credits-deduct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: toAnalyze.length }),
    }).catch(() => {})

    // Refresh credits
    const creditRes = await fetch(`/api/events/${eventId}/credit-check`)
    const creditData = await creditRes.json()
    setUserCredits(creditData.credits ?? null)
  }

  const saveProjects = async (projects: ProjectCSVRow[]) => {
    if (projects.length === 0) { toast.error(t('import.noProjects')); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/events/${eventId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('import.saveFailed'))
      const count: number = data.inserted ?? projects.length
      if ((data.skipped ?? 0) > 0) {
        toast.warning(t('import.importedWithSkipped').replace('{n}', String(count)).replace('{skipped}', String(data.skipped)))
      } else {
        toast.success(t('import.importSuccess').replace('{n}', String(count)))
      }
      setImportedCount(count)
      setImportDone(true)
      setParsedProjects([])  // Clear parsed CSV so analysis config section shows

      // Save column mapping to event
      if (Object.keys(savedMapping).length > 0) {
        fetch(`/api/events/${eventId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ column_mapping: savedMapping }),
        }).catch(() => {})
      }

      // Start batch GitHub analysis in background
      // (user will trigger manually via button)

      // Fetch user credits
      setLoadingCredits(true)
      try {
        const creditRes = await fetch(`/api/events/${eventId}/credit-check`)
        const creditData = await creditRes.json()
        setUserCredits(creditData.credits ?? null)
      } catch {
        // ignore
      } finally {
        setLoadingCredits(false)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('import.saveFailedRetry'))
    } finally {
      setSaving(false)
    }
  }

  const toggleModel = (modelKey: string) => {
    setSelectedModels(prev =>
      prev.includes(modelKey) ? prev.filter(m => m !== modelKey) : [...prev, modelKey]
    )
  }

  const handleSaveConfigAndContinue = async () => {
    if (selectedModels.length === 0) {
      toast.error(t('import.modelRequired'))
      return
    }

    setSavingConfig(true)
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models: selectedModels, web3_enabled: web3Enabled }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('import.saveFailed'))
      router.push(`/events/${eventId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('import.saveFailedRetry'))
    } finally {
      setSavingConfig(false)
    }
  }

  const canConfirmImport =
    detectState.status === 'done' &&
    fieldRows.filter(r => r.isRequired).every(r => r.csvColumn !== null)

  // Dynamic pricing based on actual description length
  const descMultiplier = descLengthMultiplier(avgDescLength(parsedProjects))
  const totalCostPerProject = selectedModels.reduce((sum, m) => sum + modelCredits(m, descMultiplier), 0)
  // Use parsed CSV count for cost estimation when CSV is loaded; fall back to already-imported count
  const billingCount = parsedProjects.length > 0 ? parsedProjects.length : importedCount
  const githubCost = billingCount * 1 // always included
  const sonarCost = sonarEnabled ? billingCount * 2 : 0
  const web3Cost = web3Enabled ? Math.ceil(billingCount * 0.5) : 0
  const totalCost = selectedModels.length > 0
    ? billingCount * totalCostPerProject + githubCost + sonarCost + web3Cost
    : 0
  const hasEnough = userCredits !== null && totalCost <= userCredits

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {isLoadingPage && (
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-3">
          <Loader2 size={22} className="animate-spin" />
          <span className="text-sm">{t('import.loading')}</span>
        </div>
      )}
      {!isLoadingPage && <>
      <div className="mb-6">
        <Link
          href={`/events/${eventId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft size={14} />
          {t('import.backToEvent')}
        </Link>
        <h1 className="text-2xl font-bold">{t('import.title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t('import.subtitle')}</p>
      </div>

      <Tabs defaultValue="csv">
        <TabsList className="mb-6">
          <TabsTrigger value="csv">{t('import.tabCsv')}</TabsTrigger>
          <TabsTrigger value="manual">{t('import.tabManual')}</TabsTrigger>
        </TabsList>

        {/* CSV Upload Tab */}
        <TabsContent value="csv" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('import.csvTitle')}</CardTitle>
              <CardDescription>
                {t('import.csvDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="gap-1.5">
                  <Download size={14} />
                  {t('import.downloadTemplate')}
                </Button>
              </div>

              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-[var(--color-border-strong)] transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={32} className="mx-auto mb-3 text-fg-subtle" />
                <p className="text-sm font-medium">
                  {fileName || t('import.dropzone')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t('import.csvFormat')}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* AI Detection States */}
              {detectState.status === 'detecting' && (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 size={15} className="animate-spin shrink-0" />
                  {t('import.detecting')}
                </div>
              )}

              {detectState.status === 'error' && (
                <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
                  <AlertCircle size={15} className="shrink-0" />
                  {detectState.message}{t('import.detectFallback')}
                </div>
              )}

              {detectState.status === 'done' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{t('import.mapping')}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-xs px-2"
                      onClick={() => setFieldRows(rows => [...rows, { id: Math.random().toString(36).slice(2) + Date.now().toString(36), label: '', csvColumn: null, isRequired: false }])}
                    >
                      <Plus size={12} />
                      {t('import.addField')}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {fieldRows.map(row => {
                      const isMissing = row.isRequired && row.csvColumn === null
                      return (
                        <div key={row.id} className="flex items-center gap-2">
                          <Input
                            value={row.label}
                            onChange={e => setFieldRows(rows => rows.map(r => r.id === row.id ? { ...r, label: e.target.value } : r))}
                            className={`w-32 shrink-0 bg-bg text-sm ${isMissing ? 'border-red-400' : 'border-token'} text-fg`}
                            placeholder={t('import.fieldNamePlaceholder')}
                          />
                          <Select
                            value={row.csvColumn ?? '__none__'}
                            onValueChange={val => setFieldRows(rows => rows.map(r => r.id === row.id ? { ...r, csvColumn: val === '__none__' ? null : val } : r))}
                          >
                            <SelectTrigger className={`flex-1 text-sm bg-bg ${isMissing ? 'border-red-400' : ''}`}>
                              <SelectValue placeholder={t('import.noMapping')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">{t('import.noMapping')}</SelectItem>
                              {detectState.headers.filter(h => h.trim()).map(header => (
                                <SelectItem key={header} value={header}>{header}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <button
                            type="button"
                            onClick={() => setFieldRows(rows => rows.filter(r => r.id !== row.id))}
                            className="text-fg-subtle hover:text-red-500 shrink-0"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {!canConfirmImport && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      <AlertCircle size={14} className="shrink-0" />
                      {t('import.requiredNotMapped')}
                    </div>
                  )}

                  {canConfirmImport && parsedProjects.length === 0 && (
                    <Button className="w-full" onClick={handleConfirmImport}>
                      {t('import.confirmAndImport')}
                    </Button>
                  )}
                </div>
              )}

              {parseErrors.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
                  <p className="text-sm font-medium text-red-700 flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    {t('import.parseErrorTitle')}
                  </p>
                  {parseErrors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600">
                      {t('import.parseRowError').replace('{row}', String(err.row)).replace('{message}', err.message)}
                    </p>
                  ))}
                </div>
              )}

              {parsedProjects.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Check size={14} className="text-green-600" />
                    {t('import.parsedCount').replace('{n}', String(parsedProjects.length))}
                  </p>
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {fieldRows.filter(r => r.csvColumn).map(r => (
                            <TableHead key={r.id}>{r.label}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedProjects.slice(0, 5).map((p, i) => (
                          <TableRow key={i}>
                            {fieldRows.filter(r => r.csvColumn).map(r => {
                              // Map fieldKey to project field value
                              const fk = r.fieldKey || r.label
                              let val: string = ''
                              if (fk === 'name') val = p.name
                              else if (fk === 'github_url') val = p.github_url
                              else if (fk === 'description') val = p.description?.slice(0, 40) + (p.description && p.description.length > 40 ? '…' : '')
                              else if (fk === 'demo_url') val = p.demo_url || ''
                              else if (fk === 'team_name') val = p.team_name || ''
                              else if (fk === 'track_ids') {
                                val = (p.track_ids ?? []).map((id: string) => eventTracks.find(t => t.id === id)?.name ?? id).join(', ')
                              }
                              else val = p.extra_fields?.[r.label] || ''
                              const isLink = /^https?:\/\//.test(val)
                              return (
                                <TableCell key={r.id} className="text-sm max-w-[160px]">
                                  {isLink ? (
                                    <span className="text-xs text-muted-foreground truncate block" title={val}>
                                      {val.replace(/^https?:\/\//, '').slice(0, 30)}…
                                    </span>
                                  ) : val || '—'}
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        ))}
                        {parsedProjects.length > 5 && (
                          <TableRow>
                            <TableCell colSpan={fieldRows.filter(r => r.csvColumn).length || 3} className="text-center text-xs text-muted-foreground py-2">
                              {t('import.moreProjects').replace('{n}', String(parsedProjects.length - 5))}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <Button
                    className="mt-6 w-full h-12 text-base font-semibold"
                    size="lg"
                    onClick={() => saveProjects(parsedProjects)}
                    disabled={saving}
                  >
                    {saving ? (
                      <><Loader2 size={16} className="mr-2 animate-spin" />{t('import.importing')}</>
                    ) : (
                      <><Check size={16} className="mr-2" />{t('import.confirmImportN').replace('{n}', String(parsedProjects.length))}</>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manual Entry Tab */}
        <TabsContent value="manual" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('import.manualTitle')}</CardTitle>
              <CardDescription>{t('import.manualSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('import.field.name')} <span className="text-red-500">*</span></Label>
                  <Input placeholder={t('import.manual.namePlaceholder')} value={manualName} onChange={e => setManualName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('import.field.team')}</Label>
                  <Input placeholder={t('import.manual.optional')} value={manualTeam} onChange={e => setManualTeam(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>GitHub URL <span className="text-red-500">*</span></Label>
                <Input placeholder="https://github.com/..." value={manualGithub} onChange={e => setManualGithub(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Demo URL</Label>
                <Input placeholder={t('import.manual.demoPlaceholder')} value={manualDemo} onChange={e => setManualDemo(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>
                  {t('import.field.desc')} <span className="text-red-500">*</span>
                  <span className="text-muted-foreground font-normal ml-1 text-xs">({manualDesc.length}/500)</span>
                </Label>
                <Textarea
                  placeholder={t('import.manual.descPlaceholder')}
                  value={manualDesc}
                  onChange={e => setManualDesc(e.target.value)}
                  maxLength={500}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('import.manual.tagsLabel')}</Label>
                <Input placeholder={t('import.manual.tagsPlaceholder')} value={manualTags} onChange={e => setManualTags(e.target.value)} />
              </div>

              <Button type="button" variant="outline" onClick={handleAddManual} className="w-full gap-1.5">
                <Plus size={14} />
                {t('import.manual.addToList')}
              </Button>
            </CardContent>
          </Card>

          {manualProjects.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('import.pendingImport').replace('{n}', String(manualProjects.length))}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('import.field.name')}</TableHead>
                      <TableHead>{t('import.colTeam')}</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualProjects.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-sm">{p.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.team_name || '—'}</TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => removeManualProject(i)}
                            className="text-fg-subtle hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="p-4">
                  <Button className="w-full" onClick={() => saveProjects(manualProjects)} disabled={saving}>
                    {saving ? t('import.saving') : t('import.importN').replace('{n}', String(manualProjects.length))}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Analysis Progress Banner */}
      {analyzingActive && (
        <div className="mt-4 p-4 rounded-lg border border-blue-200 bg-blue-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-blue-600" />
              <span className="text-sm font-medium text-blue-800">
                {t('import.analyzing').replace('{done}', String(analyzingDone)).replace('{total}', String(analyzingTotal))}
              </span>
            </div>
            <span className="text-xs text-blue-600">
              {t('import.estimatedTime').replace('{n}', String(Math.ceil((analyzingTotal - analyzingDone) * 2.5 / 60)))}
            </span>
          </div>
          <div className="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${analyzingTotal > 0 ? (analyzingDone / analyzingTotal) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-blue-500 mt-1.5">{t('import.analyzingNote')}</p>
        </div>
      )}

      {!analyzingActive && analyzingDone > 0 && analyzingDone === analyzingTotal && (
        <div className="mt-4 p-3 rounded-lg border border-emerald-200 bg-emerald-50 flex items-center gap-2">
          <CheckCircle size={14} className="text-emerald-600" />
          <span className="text-sm text-emerald-700">{t('import.fullAnalysisComplete').replace('{n}', String(analyzingDone))}</span>
        </div>
      )}

      {importDone && parsedProjects.length === 0 && (
        <div ref={analyzeRef} className="mt-6 space-y-3">
          {/* Model Config Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('import.selectModels')}</CardTitle>
              <CardDescription>
                <span>{t('import.selectModelsDesc')}</span>
                {descMultiplier > 1 && (
                  <span className="ml-2 text-amber-600 font-medium">
                    {t('import.creditsMultiplier').replace('{n}', String(descMultiplier))}
                  </span>
                )}
              </CardDescription>
              {/* Analysis Dimensions — collapsible */}
              <div className="mt-2">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setDimExpanded(v => !v)}
                >
                  <Check size={11} className="text-green-500" />
                  {t('import.aiDimensions').replace('{n}', String((eventDimensions.length > 0 ? eventDimensions.length : 4) + 2))}
                  <ChevronDown size={12} className={`transition-transform ${dimExpanded ? 'rotate-180' : ''}`} />
                </button>
                {dimExpanded && (
                  <div className="mt-2 rounded-lg border border-token bg-surface p-3 space-y-1.5 text-xs text-muted-foreground">
                    {(eventDimensions.length > 0 ? eventDimensions : [
                      { name: t('import.dim.completeness'), description: t('import.dim.completenessDesc') },
                      { name: t('import.dim.feasibility'), description: t('import.dim.feasibilityDesc') },
                      { name: t('import.dim.business'), description: t('import.dim.businessDesc') },
                      { name: t('import.dim.team'), description: t('import.dim.teamDesc') },
                    ]).map(d => (
                      <div key={d.name} className="flex gap-2">
                        <Check size={11} className="text-green-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium text-foreground">{d.name}</span>
                          {d.description && <span className="ml-1.5">{d.description}</span>}
                        </div>
                      </div>
                    ))}
                    {[
                      { name: t('import.dim.github'), description: t('import.dim.githubDesc') },
                      { name: t('import.dim.demo'), description: t('import.dim.demoDesc') },
                    ].map(d => (
                      <div key={d.name} className="flex gap-2">
                        <Check size={11} className="text-green-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium text-foreground">{d.name}</span>
                          <span className="ml-1.5">{d.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {AVAILABLE_MODELS.map(model => (
                  <div
                    key={model.key}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedModels.includes(model.key)
                        ? 'border-[var(--color-fg)] bg-surface'
                        : 'border-token hover:border-[var(--color-border-strong)]'
                    }`}
                    onClick={() => toggleModel(model.key)}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedModels.includes(model.key)}
                        onCheckedChange={() => toggleModel(model.key)}
                      />
                      <span className="text-sm font-medium">{model.name}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {t('import.creditsPerProject').replace('{n}', String(modelCredits(model.key, descMultiplier)))}
                    </Badge>
                  </div>
                ))}
              </div>

              <Separator />

              {/* SonarQube — optional */}
              <div
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  sonarEnabled ? 'border-[var(--color-fg)] bg-surface' : 'border-token hover:border-[var(--color-border-strong)]'
                }`}
                onClick={() => setSonarEnabled(!sonarEnabled)}
              >
                <div className="flex items-center gap-3">
                  <Checkbox checked={sonarEnabled} onCheckedChange={() => setSonarEnabled(!sonarEnabled)} />
                  <div>
                    <p className="text-sm font-medium">{t('import.sonarTitle')}</p>
                    <p className="text-xs text-muted-foreground">{t('import.sonarDesc')}</p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">{t('import.sonarCost')}</Badge>
              </div>

              {/* Web3 Insight — optional */}
              <div
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  web3Enabled ? 'border-[var(--color-fg)] bg-surface' : 'border-token hover:border-[var(--color-border-strong)]'
                }`}
                onClick={() => setWeb3Enabled(!web3Enabled)}
              >
                <div className="flex items-center gap-3">
                  <Checkbox checked={web3Enabled} onCheckedChange={() => setWeb3Enabled(!web3Enabled)} />
                  <div>
                    <p className="text-sm font-medium">{t('import.web3Title')}</p>
                    <p className="text-xs text-muted-foreground">{t('import.web3Desc')}</p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">{t('import.web3Cost')}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Cost Estimate Card — only shown when models are selected */}
          {selectedModels.length > 0 && (
            <Card className="border bg-muted/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('import.costEstimate')}</CardTitle>
                <CardDescription>{t('import.toAnalyze').replace('{n}', String(billingCount))}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingCredits ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" />
                    {t('import.loading')}
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      {selectedModels.map(model => {
                        const credits = modelCredits(model, descMultiplier)
                        const subtotal = billingCount * credits
                        return (
                          <div key={model} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Check size={13} className="text-green-500 shrink-0" />
                              {MODEL_NAMES[model] ?? model}
                            </span>
                            <span className="text-muted-foreground">
                              {billingCount} × {credits} {t('import.creditsUnit')} ={' '}
                              <span className="font-medium text-foreground">{subtotal} {t('import.creditsUnit')}</span>
                            </span>
                          </div>
                        )
                      })}
                      {/* GitHub — always */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Check size={13} className="text-green-500 shrink-0" />
                          {t('import.githubAnalysis')}
                        </span>
                        <span className="text-muted-foreground">
                          {billingCount} × 1 {t('import.creditsUnit')} ={' '}
                          <span className="font-medium text-foreground">{githubCost} {t('import.creditsUnit')}</span>
                        </span>
                      </div>
                      {/* SonarQube — optional */}
                      {sonarEnabled && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Check size={13} className="text-green-500 shrink-0" />
                            {t('import.sonarAnalysis')}
                          </span>
                          <span className="text-muted-foreground">
                            {billingCount} × 2 {t('import.creditsUnit')} ={' '}
                            <span className="font-medium text-foreground">{sonarCost} {t('import.creditsUnit')}</span>
                          </span>
                        </div>
                      )}
                      {/* Web3 — optional */}
                      {web3Enabled && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Check size={13} className="text-green-500 shrink-0" />
                            {t('import.web3Title')}
                          </span>
                          <span className="text-muted-foreground">
                            {billingCount} × 0.5 {t('import.creditsUnit')} ={' '}
                            <span className="font-medium text-foreground">{web3Cost} {t('import.creditsUnit')}</span>
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="border-t pt-2 flex items-center justify-between text-sm font-semibold">
                      <span>{t('import.total')}</span>
                      <span>{t('import.totalCredits').replace('{n}', String(totalCost))}</span>
                    </div>
                    {userCredits !== null && (
                      <div
                        className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                          hasEnough
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        <span>{t('import.balance').replace('{n}', String(userCredits))}</span>
                        {hasEnough ? (
                          <span className="flex items-center gap-1 font-medium">
                            <Check size={13} />
                            {t('import.sufficient')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 font-medium">
                            <AlertCircle size={13} />
                            {t('import.insufficient')}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={startBatchAnalysis}
              disabled={analyzingActive}
            >
              {analyzingActive
                ? <><Loader2 size={14} className="animate-spin" />{t('import.analyzing').replace('{done}', String(analyzingDone)).replace('{total}', String(analyzingTotal))}</>
                : <><Activity size={14} />{t('import.startFullAnalysis')}</>}
            </Button>
            <Button
              className="flex-1"
              onClick={handleSaveConfigAndContinue}
              disabled={savingConfig}
            >
              {savingConfig ? t('import.saving') : t('import.saveAndContinue')}
            </Button>
          </div>
        </div>
      )}
    </>}
    </div>
  )
}
