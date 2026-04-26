'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, Loader2, X } from 'lucide-react'
import { useT, type TranslationKey } from '@/lib/i18n'
import ImageUpload from '@/components/ImageUpload'
import AIBannerButton from '@/components/AIBannerButton'
import RichEditor from '@/components/RichEditor'
import { Checkbox } from '@/components/ui/checkbox'
import { MODEL_NAMES, MODEL_CREDITS, MODEL_COLORS, ALL_MODEL_KEYS } from '@/lib/models'

interface Dimension {
  name: string
  weight: number
  description?: string
}

interface Track {
  id: string
  name: string
  description?: string
  prize?: string
}

interface CustomField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'url' | 'select' | 'multiselect'
  required: boolean
  default?: boolean
  options?: string[]
}

interface FieldTemplate {
  labelKey: TranslationKey
  type: CustomField['type']
  options?: string[]
  dynamicOptions?: 'tracks'
}

const FIELD_TEMPLATES: FieldTemplate[] = [
  { labelKey: 'field.template.projectIntro', type: 'textarea' },
  { labelKey: 'field.template.projectWebsite', type: 'url' },
  { labelKey: 'field.template.demoVideo', type: 'url' },
  { labelKey: 'field.template.teamSize', type: 'select', options: ['1', '2-3', '4-5', '6+'] },
  { labelKey: 'field.template.track', type: 'select', dynamicOptions: 'tracks' },
  { labelKey: 'field.template.techStack', type: 'multiselect', options: ['Solana', 'Ethereum', 'Base', 'Sui', 'Move', 'Rust', 'TypeScript', 'Python'] },
  { labelKey: 'field.template.city', type: 'text' },
  { labelKey: 'field.template.twitter', type: 'url' },
  { labelKey: 'field.template.telegram', type: 'text' },
]

function genTrackId() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}

// Convert datetime-local string to ISO or back
function toDatetimeLocal(iso: string | null | undefined) {
  if (!iso) return ''
  // datetime-local needs format: YYYY-MM-DDTHH:mm
  return iso.slice(0, 16)
}

export default function EditEventPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const t = useT()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Basic info
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mode, setMode] = useState<'ai_only' | 'panel_review'>('ai_only')
  const [tracks, setTracks] = useState<Track[]>([])
  const [dimensions, setDimensions] = useState<Dimension[]>([])
  const [models, setModels] = useState<string[]>([])
  const [web3Enabled, setWeb3Enabled] = useState(false)
  const [bannerUrl, setBannerUrl] = useState<string>('')
  const [isHidden, setIsHidden] = useState(false)
  const [newDimName, setNewDimName] = useState('')

  // Registration
  const [regOpen, setRegOpen] = useState(false)
  const [regAutoApprove, setRegAutoApprove] = useState(false)
  const [allowMultipleAgents, setAllowMultipleAgents] = useState(false)
  const [regDeadline, setRegDeadline] = useState('')
  const [subDeadline, setSubDeadline] = useState('')
  const [startTime, setStartTime] = useState('')
  const [resultAnnouncedAt, setResultAnnouncedAt] = useState('')
  const [registrationOpenAt, setRegistrationOpenAt] = useState('')
  const [judgingStartAt, setJudgingStartAt] = useState('')
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldType, setNewFieldType] = useState<CustomField['type']>('text')
  const [newFieldOptions, setNewFieldOptions] = useState<string[]>([])
  const [newOptionInput, setNewOptionInput] = useState('')

  const fetchEvent = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${id}`)
      if (!res.ok) {
        if (res.status === 403 || res.status === 404) {
          toast.error(t('event.noPermission'))
        }
        router.replace('/events')
        return
      }
      const ev = await res.json()
      setName(ev.name ?? '')
      setDescription(ev.description ?? '')
      setMode(ev.mode ?? 'ai_only')
      setTracks(Array.isArray(ev.tracks) ? ev.tracks : [])
      setDimensions(Array.isArray(ev.dimensions) ? ev.dimensions : [])
      setModels(Array.isArray(ev.models) ? ev.models : [])
      setWeb3Enabled(ev.web3_enabled ?? false)
      setBannerUrl(ev.banner_url ?? '')
      setIsHidden(ev.is_hidden ?? false)
      const regConfig = ev.registration_config
      if (regConfig) {
        setRegOpen(regConfig.open ?? false)
        setRegAutoApprove(regConfig.auto_approve ?? false)
        setAllowMultipleAgents(regConfig.allow_multiple_agents_per_owner ?? false)
        const customOnly = (regConfig.fields ?? []).filter((f: CustomField) => !f.default)
        setCustomFields(customOnly)
      }
      setRegDeadline(toDatetimeLocal(ev.registration_deadline))
      setSubDeadline(toDatetimeLocal(ev.submission_deadline))
      setStartTime(ev.start_time ? toDatetimeLocal(ev.start_time) : '')
      setResultAnnouncedAt(ev.result_announced_at ? toDatetimeLocal(ev.result_announced_at) : '')
      setRegistrationOpenAt(ev.registration_open_at ? toDatetimeLocal(ev.registration_open_at) : '')
      setJudgingStartAt(ev.judging_start_at ? toDatetimeLocal(ev.judging_start_at) : '')
    } catch {
      toast.error(t('event.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, router, t])

  useEffect(() => { fetchEvent() }, [fetchEvent])

  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0)

  const addTrack = () => setTracks(prev => [...prev, { id: genTrackId(), name: '' }])
  const removeTrack = (idx: number) => setTracks(prev => prev.filter((_, i) => i !== idx))
  const updateTrack = (idx: number, field: keyof Track, value: string) =>
    setTracks(prev => prev.map((tr, i) => i === idx ? { ...tr, [field]: value } : tr))

  const removeDimension = (idx: number) => {
    if (dimensions.length <= 1) return
    const newDims = dimensions.filter((_, i) => i !== idx)
    const totalW = newDims.reduce((s, d) => s + d.weight, 0)
    if (totalW !== 100 && newDims.length > 0) newDims[0].weight += 100 - totalW
    setDimensions(newDims)
  }

  const updateWeight = (idx: number, value: number) => {
    const clamped = Math.min(100, Math.max(1, value || 0))
    setDimensions(prev => prev.map((d, i) => i === idx ? { ...d, weight: clamped } : d))
  }

  const addDimension = () => {
    if (!newDimName.trim() || dimensions.length >= 8) return
    const newWeight = Math.floor(100 / (dimensions.length + 1))
    const adjusted = dimensions.map(d => ({ ...d, weight: newWeight }))
    const rem = 100 - newWeight * (dimensions.length + 1)
    setDimensions([...adjusted, { name: newDimName.trim(), weight: newWeight + rem }])
    setNewDimName('')
  }

  const addCustomField = (label?: string, type?: CustomField['type'], options?: string[]) => {
    const fieldLabel = label ?? newFieldLabel
    const fieldType = type ?? newFieldType
    const fieldOptions = options ?? (['select', 'multiselect'].includes(fieldType) ? newFieldOptions : undefined)
    if (!fieldLabel.trim()) return
    const key = 'custom_' + fieldLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    setCustomFields(prev => [
      ...prev,
      { key, label: fieldLabel.trim(), type: fieldType, required: false, options: fieldOptions?.length ? fieldOptions : undefined },
    ])
    if (!label) {
      setNewFieldLabel('')
      setNewFieldType('text')
      setNewFieldOptions([])
      setNewOptionInput('')
    }
  }

  const removeCustomField = (idx: number) => setCustomFields(prev => prev.filter((_, i) => i !== idx))

  const updateCustomField = (idx: number, field: Partial<CustomField>) =>
    setCustomFields(prev => prev.map((f, i) => i === idx ? { ...f, ...field } : f))

  const removeFieldOption = (fieldIdx: number, optIdx: number) => {
    setCustomFields(prev => prev.map((f, i) => {
      if (i !== fieldIdx) return f
      const opts = (f.options ?? []).filter((_, oi) => oi !== optIdx)
      return { ...f, options: opts.length ? opts : undefined }
    }))
  }

  const addNewOption = () => {
    const val = newOptionInput.trim()
    if (!val || newFieldOptions.includes(val)) return
    setNewFieldOptions(prev => [...prev, val])
    setNewOptionInput('')
  }

  const toggleModel = (key: string) => {
    setModels(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const estimatedCredits = models.reduce((sum, k) => sum + (MODEL_CREDITS[k] ?? 1), 0)

  const handleSave = async () => {
    if (!name.trim()) { toast.error(t('edit.nameRequired')); return }
    if (totalWeight !== 100) { toast.error(t('edit.weightMustBe100').replace('{total}', String(totalWeight))); return }
    if (models.length === 0) { toast.error(t('models.selectAtLeastOne')); return }
    const activeTracks = tracks.filter(tr => tr.name.trim())
    const defaultFields = [
      { key: 'team_name', label: t('reg.teamName'), type: 'text', required: true, default: true },
      { key: 'github_url', label: t('reg.githubUrl'), type: 'url', required: false, default: true },
      ...(activeTracks.length > 0
        ? [{ key: 'track_id', label: t('reg.trackSelect'), type: 'text', required: false, default: true }]
        : []),
    ]

    setSaving(true)
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          dimensions,
          models,
          web3_enabled: web3Enabled,
          mode,
          tracks: activeTracks,
          banner_url: bannerUrl || null,
          is_hidden: isHidden,
          registration_deadline: regDeadline ? new Date(regDeadline).toISOString() : null,
          submission_deadline: subDeadline ? new Date(subDeadline).toISOString() : null,
          start_time: startTime ? new Date(startTime).toISOString() : null,
          result_announced_at: resultAnnouncedAt ? new Date(resultAnnouncedAt).toISOString() : null,
          registration_open_at: registrationOpenAt ? new Date(registrationOpenAt).toISOString() : null,
          judging_start_at: judgingStartAt ? new Date(judgingStartAt).toISOString() : null,
          registration_config: {
            open: regOpen,
            auto_approve: regAutoApprove,
            allow_multiple_agents_per_owner: allowMultipleAgents,
            fields: [...defaultFields, ...customFields],
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('common.saveFailed'))

      toast.success(t('edit.save'))
      router.push(`/events/${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[300px]">
        <Loader2 className="animate-spin" size={24} />
      </div>
    )
  }

  const activeTracks = tracks.filter(tr => tr.name.trim())

  const typeLabel = (type: CustomField['type']) => {
    const map: Record<CustomField['type'], TranslationKey> = {
      text: 'field.type.text',
      textarea: 'field.type.textarea',
      url: 'field.type.url',
      select: 'field.type.select',
      multiselect: 'field.type.multiselect',
    }
    return t(map[type])
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Link href={`/events/${id}`} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-xl font-bold">{t('edit.title')}</h1>
      </div>

      {/* Basic info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('event.edit.basicInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <ImageUpload
              value={bannerUrl || null}
              onChange={url => setBannerUrl(url)}
              bucket="event-banners"
              path={id}
              label={t('upload.banner')}
              aspectRatio="banner"
            />
            <AIBannerButton eventId={id} onGenerated={url => setBannerUrl(url)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">{t('edit.name')} <span className="text-red-500">*</span></Label>
            <Input id="name" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('edit.desc')}</Label>
            <RichEditor
              value={description}
              onChange={setDescription}
              placeholder={t('edit.descPlaceholder')}
            />
          </div>
          {/* Hide event toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{t('event.edit.isHidden')}</p>
              <p className="text-xs text-muted-foreground">{t('event.edit.isHiddenDesc')}</p>
            </div>
            <Switch checked={isHidden} onCheckedChange={setIsHidden} />
          </div>
          {/* Tracks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('track.labelOptional')}</Label>
            </div>
            {tracks.map((tr, idx) => (
              <div key={tr.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={t('track.placeholder')}
                    value={tr.name}
                    onChange={e => updateTrack(idx, 'name', e.target.value)}
                    className="flex-1 h-8 text-sm"
                  />
                  <button type="button" onClick={() => removeTrack(idx)} className="text-fg-subtle hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder={t('track.descOptional')}
                    value={tr.description ?? ''}
                    onChange={e => updateTrack(idx, 'description', e.target.value)}
                    className="h-7 text-xs"
                  />
                  <Input
                    placeholder={t('track.prizeOptional')}
                    value={tr.prize ?? ''}
                    onChange={e => updateTrack(idx, 'prize', e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addTrack} className="gap-1.5 w-full">
              <Plus size={14} />
              {t('track.add')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Models */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t('models.title')}</CardTitle>
            <span className="text-xs text-muted-foreground">
              {t('models.estimatedCost')}<span className="font-semibold text-fg-muted">{estimatedCredits}</span> {t('models.creditsUnit')}
            </span>
          </div>
          <CardDescription>{t('models.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_MODEL_KEYS.map(key => {
              const checked = models.includes(key)
              return (
                <label
                  key={key}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    checked ? 'border-[var(--color-fg)] bg-[var(--color-fg)]/5' : 'border-token hover:border-[var(--color-border-strong)]'
                  }`}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleModel(key)} />
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${MODEL_COLORS[key] ?? 'bg-surface-2 text-fg-muted'}`}
                    >
                      {MODEL_NAMES[key] ?? key}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {MODEL_CREDITS[key] ?? 1} {t('models.perProject')}
                    </span>
                  </div>
                </label>
              )
            })}
          </div>
          {models.length === 0 && (
            <p className="text-xs text-red-500">{t('models.selectAtLeastOne')}</p>
          )}
        </CardContent>
      </Card>

      {/* Dimensions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('edit.dimensions')}</CardTitle>
          <CardDescription>
            {t('edit.weightTotal')}
            <span className={totalWeight === 100 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
              {totalWeight}%
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {dimensions.map((dim, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <span className="flex-1 text-sm">{dim.name}</span>
              <input
                type="number"
                min={1}
                max={100}
                key={`${idx}-${dim.weight}`}
                defaultValue={dim.weight}
                onBlur={e => updateWeight(idx, parseInt(e.target.value))}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="w-[60px] border rounded px-2 py-1 text-sm text-right"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <button type="button" onClick={() => removeDimension(idx)} className="text-fg-subtle hover:text-red-500 transition-colors" disabled={dimensions.length <= 1}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {dimensions.length < 8 && (
            <>
              <Separator />
              <div className="flex gap-2">
                <Input
                  placeholder={t('edit.dimNamePlaceholder')}
                  value={newDimName}
                  onChange={e => setNewDimName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addDimension()}
                />
                <Button type="button" variant="outline" onClick={addDimension}>
                  <Plus size={14} />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Registration config */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('reg.formConfig')}</CardTitle>
          <CardDescription>{t('reg.openSwitchDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('reg.openSwitch')}</p>
              <p className="text-xs text-muted-foreground">{t('reg.openSwitchDesc')}</p>
            </div>
            <Switch checked={regOpen} onCheckedChange={setRegOpen} />
          </div>
          {regOpen && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t('reg.autoApprove')}</p>
                  <p className="text-xs text-muted-foreground">{t('reg.autoApproveDesc')}</p>
                </div>
                <Switch checked={regAutoApprove} onCheckedChange={setRegAutoApprove} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t('reg.config.allowMultipleAgents')}</p>
                  <p className="text-xs text-muted-foreground">{t('reg.config.allowMultipleAgentsDesc')}</p>
                </div>
                <Switch checked={allowMultipleAgents} onCheckedChange={setAllowMultipleAgents} />
              </div>
              {/* Timeline 时间轴 */}
              <div className="space-y-0">
                <p className="text-sm font-medium mb-3">{t('edit.timeline.title')}</p>
                {[
                  {
                    label: t('edit.timeline.hackathonStart'),
                    value: startTime,
                    setter: setStartTime,
                    hint: t('edit.timeline.hackathonStartHint'),
                  },
                  {
                    label: t('edit.timeline.registrationOpens'),
                    value: registrationOpenAt,
                    setter: setRegistrationOpenAt,
                    hint: t('edit.timeline.registrationOpensHint'),
                  },
                  {
                    label: t('edit.timeline.registrationDeadline'),
                    value: regDeadline,
                    setter: setRegDeadline,
                    hint: '',
                  },
                  {
                    label: t('edit.timeline.submissionDeadline'),
                    value: subDeadline,
                    setter: setSubDeadline,
                    hint: '',
                  },
                  {
                    label: t('edit.timeline.judgingStarts'),
                    value: judgingStartAt,
                    setter: setJudgingStartAt,
                    hint: t('edit.timeline.judgingStartsHint'),
                  },
                  {
                    label: t('edit.timeline.resultsAnnounced'),
                    value: resultAnnouncedAt,
                    setter: setResultAnnouncedAt,
                    hint: '',
                  },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 group">
                    {/* 左侧竖线连接 */}
                    <div className="flex flex-col items-center pt-1">
                      <div className="w-2 h-2 rounded-full bg-indigo-400 mt-2 shrink-0" />
                      {idx < 5 && <div className="w-px flex-1 bg-[var(--color-border)] mt-1 min-h-[32px]" />}
                    </div>
                    {/* 右侧内容 */}
                    <div className="flex-1 pb-4">
                      <Label className="text-xs font-medium text-fg-muted">{item.label}</Label>
                      {item.hint && <p className="text-xs text-muted-foreground mb-1">{item.hint}</p>}
                      <Input
                        type="datetime-local"
                        value={item.value}
                        onChange={e => item.setter(e.target.value)}
                        className="text-sm mt-1"
                      />
                    </div>
                  </div>
                ))}
                {/* 顺序校验提示 */}
                {regDeadline && subDeadline && new Date(regDeadline) >= new Date(subDeadline) && (
                  <p className="text-xs text-red-500 ml-5">{t('edit.timeline.orderError')}</p>
                )}
              </div>
              <Separator />
              <div className="border border-token rounded-xl p-4 bg-[var(--color-surface)]/50 space-y-4">
                {/* Default Fields */}
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium">{t('edit.fields.default')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('edit.fields.defaultDesc')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[t('reg.teamName'), t('reg.githubUrl'), ...(activeTracks.length > 0 ? [t('reg.trackSelect')] : [])].map(f => (
                      <span key={f} className="bg-bg border border-token text-fg-muted text-sm px-3 py-1 rounded-full">{f}</span>
                    ))}
                  </div>
                </div>

                {/* Custom Fields */}
                <div className="space-y-3">
                  <p className="text-sm font-medium">{t('edit.fields.custom')}</p>

                  {/* Existing custom fields list */}
                  {customFields.length > 0 && (
                    <div className="space-y-2">
                      {customFields.map((f, idx) => (
                        <div key={f.key} className="bg-bg rounded-lg border border-token p-2.5 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium flex-1">{f.label}</span>
                            <span className="bg-surface-2 text-fg-muted text-xs px-2 py-0.5 rounded">
                              {typeLabel(f.type)}
                            </span>
                            <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                checked={f.required}
                                onChange={e => updateCustomField(idx, { required: e.target.checked })}
                                className="w-3 h-3"
                              />
                              {t('edit.fields.required')}
                            </label>
                            <button type="button" onClick={() => removeCustomField(idx)} className="text-fg-subtle hover:text-red-500 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                          {(f.type === 'select' || f.type === 'multiselect') && (f.options ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {(f.options ?? []).map((opt, optIdx) => (
                                <span key={optIdx} className="inline-flex items-center gap-1 bg-surface-2 text-fg-muted text-xs px-2 py-0.5 rounded-full">
                                  {opt}
                                  <button type="button" onClick={() => removeFieldOption(idx, optIdx)} className="text-fg-subtle hover:text-red-500 transition-colors">
                                    <X size={10} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Template pills */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {t('edit.fields.quickAdd')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {FIELD_TEMPLATES.map(tpl => {
                        const tplLabel = t(tpl.labelKey)
                        const isAdded = customFields.some(cf => cf.label === tplLabel)
                        return (
                          <button
                            key={tpl.labelKey}
                            type="button"
                            disabled={isAdded}
                            onClick={() => {
                              const opts = tpl.dynamicOptions === 'tracks'
                                ? activeTracks.map(tr => tr.name)
                                : tpl.options
                              addCustomField(tplLabel, tpl.type, opts)
                            }}
                            className={`border border-dashed text-xs px-3 py-1 rounded-full transition-colors ${
                              isAdded
                                ? 'border-token text-fg-subtle cursor-not-allowed'
                                : 'border-token-strong text-fg-muted hover:border-indigo-400 hover:text-indigo-600 cursor-pointer'
                            }`}
                          >
                            {tplLabel}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Custom field input */}
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-muted-foreground">{t('edit.fields.orCustom')}</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder={t('edit.fields.customPlaceholder')}
                        value={newFieldLabel}
                        onChange={e => setNewFieldLabel(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addCustomField()}
                        className="text-sm bg-bg"
                      />
                      <select
                        value={newFieldType}
                        onChange={e => {
                          setNewFieldType(e.target.value as CustomField['type'])
                          setNewFieldOptions([])
                          setNewOptionInput('')
                        }}
                        className="text-xs border rounded px-2 py-1 bg-bg shrink-0"
                      >
                        <option value="text">{t('field.type.text')}</option>
                        <option value="textarea">{t('field.type.textarea')}</option>
                        <option value="url">{t('field.type.url')}</option>
                        <option value="select">{t('field.type.select')}</option>
                        <option value="multiselect">{t('field.type.multiselect')}</option>
                      </select>
                    </div>
                    {(newFieldType === 'select' || newFieldType === 'multiselect') && (
                      <div className="space-y-1.5 pl-0.5">
                        <div className="flex gap-2">
                          <Input
                            placeholder={t('edit.fields.optionPlaceholder')}
                            value={newOptionInput}
                            onChange={e => setNewOptionInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewOption() } }}
                            className="text-sm bg-bg h-8"
                          />
                          <Button type="button" variant="outline" size="sm" onClick={addNewOption} className="shrink-0 h-8 bg-bg">
                            {t('edit.fields.addOption')}
                          </Button>
                        </div>
                        {newFieldOptions.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {newFieldOptions.map((opt, i) => (
                              <span key={i} className="inline-flex items-center gap-1 bg-surface-2 text-fg-muted text-xs px-2 py-0.5 rounded-full">
                                {opt}
                                <button
                                  type="button"
                                  onClick={() => setNewFieldOptions(prev => prev.filter((_, oi) => oi !== i))}
                                  className="text-fg-subtle hover:text-red-500 transition-colors"
                                >
                                  <X size={10} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addCustomField()}
                      className="gap-1.5 bg-bg"
                      disabled={!newFieldLabel.trim()}
                    >
                      <Plus size={13} />
                      {t('edit.fields.addField')}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={() => router.push(`/events/${id}`)}>
          {t('edit.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <><Loader2 size={14} className="animate-spin mr-1" />{t('edit.saving')}</>
          ) : t('edit.save')}
        </Button>
      </div>
    </div>
  )
}
