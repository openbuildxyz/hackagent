'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { ChevronRight, ChevronLeft, Plus, Trash2, Check, Pencil, Loader2, Sparkles, X } from 'lucide-react'
import { useT, useLocale } from '@/lib/i18n'
import ImageUpload from '@/components/ImageUpload'
import RichEditor from '@/components/RichEditor'
import { Checkbox } from '@/components/ui/checkbox'
import { MODEL_NAMES, MODEL_CREDITS, MODEL_COLORS, ALL_MODEL_KEYS } from '@/lib/models'

interface CustomField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'url' | 'select' | 'multiselect'
  required: boolean
  options?: string[]
}

interface FieldTemplate {
  label: { zh: string; en: string }
  type: CustomField['type']
  options?: string[]
  dynamicOptions?: 'tracks'
}

const FIELD_TEMPLATES: FieldTemplate[] = [
  { label: { zh: '项目简介', en: 'Project Introduction' }, type: 'textarea' },
  { label: { zh: '项目官网', en: 'Project Website' }, type: 'url' },
  { label: { zh: 'Demo 视频', en: 'Demo Video' }, type: 'url' },
  { label: { zh: '团队规模', en: 'Team Size' }, type: 'select', options: ['1', '2-3', '4-5', '6+'] },
  { label: { zh: '参赛赛道', en: 'Track' }, type: 'select', dynamicOptions: 'tracks' },
  { label: { zh: '技术栈', en: 'Tech Stack' }, type: 'multiselect', options: ['Solana', 'Ethereum', 'Base', 'Sui', 'Move', 'Rust', 'TypeScript', 'Python'] },
  { label: { zh: '所在城市', en: 'City' }, type: 'text' },
  { label: { zh: 'Twitter/X', en: 'Twitter/X' }, type: 'url' },
  { label: { zh: 'Telegram', en: 'Telegram' }, type: 'text' },
]

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

function genTrackId() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}

interface LocalizedDimension {
  name: { zh: string; en: string }
  weight: number
  description?: { zh: string; en: string }
}

const DEFAULT_DIMENSIONS_BY_LOCALE: Record<'zh' | 'en', Dimension[]> = {
  zh: [
    { name: '创新性', weight: 20 },
    { name: '技术深度', weight: 20 },
    { name: '完成度', weight: 20 },
    { name: '商业价值', weight: 20 },
    { name: '团队', weight: 20 },
  ],
  en: [
    { name: 'Innovation', weight: 20 },
    { name: 'Technical Depth', weight: 20 },
    { name: 'Completeness', weight: 20 },
    { name: 'Business Value', weight: 20 },
    { name: 'Team', weight: 20 },
  ],
}

const DIMENSION_TEMPLATES_LOCALIZED: { label: { zh: string; en: string }; dimensions: LocalizedDimension[] }[] = [
  {
    label: { zh: '通用 Hackathon', en: 'General Hackathon' },
    dimensions: [
      { name: { zh: '创新性', en: 'Innovation' }, weight: 25, description: { zh: '解决方案是否有独特创意，是否突破或改进现有方案', en: 'Whether the solution has unique creativity and improves on existing approaches' } },
      { name: { zh: '技术深度', en: 'Technical Depth' }, weight: 25, description: { zh: '技术选型是否合理，实现难度和工程质量如何', en: 'Whether the tech stack is reasonable; implementation difficulty and engineering quality' } },
      { name: { zh: '完整度', en: 'Completeness' }, weight: 20, description: { zh: '项目功能是否完整可用，是否有可运行的 Demo', en: 'Whether features are complete and usable, with a runnable demo' } },
      { name: { zh: '展示表达', en: 'Presentation' }, weight: 15, description: { zh: '项目说明是否清晰，团队能否准确传达核心价值', en: 'Clarity of the project writeup and the team\u2019s ability to convey core value' } },
      { name: { zh: '商业价值', en: 'Business Value' }, weight: 15, description: { zh: '是否有真实用户需求，是否具备落地潜力', en: 'Whether there is real user demand and potential for real-world adoption' } },
    ],
  },
  {
    label: { zh: '开源项目评估', en: 'Open Source Eval' },
    dimensions: [
      { name: { zh: '代码质量', en: 'Code Quality' }, weight: 25, description: { zh: '代码规范性、可读性、测试覆盖率、PR 合并效率', en: 'Style, readability, test coverage, PR merge efficiency' } },
      { name: { zh: '生态健康度', en: 'Ecosystem Health' }, weight: 20, description: { zh: '活跃贡献者数量、外部贡献者占比、社区活跃度、Issue 关闭率', en: 'Active contributors, external contributor ratio, community activity, issue-close rate' } },
      { name: { zh: '技术壁垒', en: 'Technical Moat' }, weight: 25, description: { zh: '是否有核心算法创新（L1-L2）或差异化系统集成（L3），避免纯 Prompt 封装（L4）', en: 'Core algorithm innovation (L1\u2013L2) or differentiated system integration (L3); avoid pure prompt wrappers (L4)' } },
      { name: { zh: '文档完整性', en: 'Documentation' }, weight: 15, description: { zh: 'README 完整度、接入文档、示例代码、多语言支持', en: 'README completeness, integration docs, example code, multi-language support' } },
      { name: { zh: '可持续性', en: 'Sustainability' }, weight: 15, description: { zh: '治理结构（Apache/CNCF 加分）、商业化路径、维护团队稳定性', en: 'Governance structure (Apache/CNCF a plus), monetization path, maintainer stability' } },
    ],
  },
  {
    label: { zh: '产品 Demo Day', en: 'Product Demo Day' },
    dimensions: [
      { name: { zh: '问题定义', en: 'Problem Definition' }, weight: 20, description: { zh: '痛点是否真实存在，目标用户是否清晰，问题规模是否足够大', en: 'Is the pain real, is the target user clear, is the problem big enough' } },
      { name: { zh: '解决方案', en: 'Solution' }, weight: 25, description: { zh: '方案是否直接解决核心痛点，差异化是否明显', en: 'Whether the solution directly addresses the core pain with clear differentiation' } },
      { name: { zh: '市场潜力', en: 'Market Potential' }, weight: 20, description: { zh: '目标市场规模，增长趋势，竞争格局', en: 'Target market size, growth, competitive landscape' } },
      { name: { zh: '产品体验', en: 'Product Experience' }, weight: 20, description: { zh: 'UI/UX 是否流畅，用户路径是否合理，Demo 是否令人印象深刻', en: 'UI/UX fluency, reasonable user flow, impressive demo' } },
      { name: { zh: '团队执行力', en: 'Team Execution' }, weight: 15, description: { zh: '团队背景是否匹配赛道，是否有快速迭代的证据', en: 'Whether the team fits the track and has evidence of fast iteration' } },
    ],
  },
  {
    label: { zh: 'AI 应用赛道', en: 'AI Application' },
    dimensions: [
      { name: { zh: '模型应用合理性', en: 'Model Fit' }, weight: 25, description: { zh: '模型选型是否与任务匹配，是否避免过度工程化', en: 'Whether model choice matches the task and avoids over-engineering' } },
      { name: { zh: '技术实现', en: 'Technical Implementation' }, weight: 25, description: { zh: 'Prompt 设计、RAG/Agent 架构、输出质量和稳定性', en: 'Prompt design, RAG/Agent architecture, output quality and stability' } },
      { name: { zh: '用户体验', en: 'User Experience' }, weight: 20, description: { zh: 'AI 能力是否自然融入产品，是否有效降低用户操作门槛', en: 'Whether AI blends naturally into the product and lowers the user threshold' } },
      { name: { zh: '创新性', en: 'Innovation' }, weight: 20, description: { zh: '是否在 AI 应用层面有新思路，而非简单套用已有方案', en: 'Novel ideas at the AI-application layer, not simple rewraps of existing solutions' } },
      { name: { zh: '完整度', en: 'Completeness' }, weight: 10, description: { zh: '功能是否闭环，边界情况处理，错误提示是否友好', en: 'Feature loop closure, edge-case handling, error messaging' } },
    ],
  },
  {
    label: { zh: '公链/基础设施', en: 'Chain/Infrastructure' },
    dimensions: [
      { name: { zh: '技术创新', en: 'Technical Innovation' }, weight: 30, description: { zh: '是否有原创性技术贡献，能否成为所在细分领域的事实标准', en: 'Original technical contribution; potential to become the de-facto standard in its niche' } },
      { name: { zh: '安全性', en: 'Security' }, weight: 25, description: { zh: '安全设计是否严谨，是否有审计或形式化验证计划', en: 'Rigor of security design; audit or formal-verification plans' } },
      { name: { zh: '性能', en: 'Performance' }, weight: 20, description: { zh: 'TPS/延迟/资源消耗等关键指标，是否有可信 benchmark', en: 'TPS/latency/resource metrics; presence of credible benchmarks' } },
      { name: { zh: '开发者体验', en: 'Developer Experience' }, weight: 25, description: { zh: 'SDK/文档/工具链完整度，开发者上手难度', en: 'SDK/docs/toolchain completeness; developer onboarding friction' } },
    ],
  },
]

function pickLocalizedDimensions(locale: 'zh' | 'en', tpl: typeof DIMENSION_TEMPLATES_LOCALIZED[number]): Dimension[] {
  return tpl.dimensions.map(d => ({
    name: d.name[locale],
    weight: d.weight,
    description: d.description?.[locale],
  }))
}

const DRAFT_KEY = 'hackagent-new-event-draft'

function loadDraft() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function NewEventForm() {
  const router = useRouter()
  const t = useT()
  const [locale] = useLocale()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const isInitialMount = useRef(true)
  const isClearingRef = useRef(false)

  // AI generate state
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)

  // Step 1 data
  const [name, setName] = useState(() => loadDraft()?.name ?? '')
  const [track, setTrack] = useState(() => loadDraft()?.track ?? '')
  const [description, setDescription] = useState(() => loadDraft()?.description ?? '')
  const [mode, setMode] = useState<'ai_only' | 'panel_review'>(() => loadDraft()?.mode ?? 'ai_only')
  const [models, setModels] = useState<string[]>(() => {
    const draft = loadDraft()?.models
    return Array.isArray(draft) && draft.length > 0 ? draft : [...ALL_MODEL_KEYS]
  })
  const [bannerUrl, setBannerUrl] = useState<string>('')

  // Tracks
  const [tracks, setTracks] = useState<Track[]>(() => loadDraft()?.tracks ?? [])

  // Registration config
  const [regOpen, setRegOpen] = useState(false)
  const [regAutoApprove, setRegAutoApprove] = useState(false)
  const [regDeadline, setRegDeadline] = useState('')
  const [subDeadline, setSubDeadline] = useState('')
  const [startTime, setStartTime] = useState(() => loadDraft()?.startTime ?? '')
  const [resultAnnouncedAt, setResultAnnouncedAt] = useState(() => loadDraft()?.resultAnnouncedAt ?? '')
  const [registrationOpenAt, setRegistrationOpenAt] = useState(() => loadDraft()?.registrationOpenAt ?? '')
  const [judgingStartAt, setJudgingStartAt] = useState(() => loadDraft()?.judgingStartAt ?? '')
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [newFieldType, setNewFieldType] = useState<CustomField['type']>('text')
  const [newFieldOptions, setNewFieldOptions] = useState<string[]>([])
  const [newOptionInput, setNewOptionInput] = useState('')

  // Step 2 data
  const [dimensions, setDimensions] = useState<Dimension[]>(() => {
    const draft = loadDraft()?.dimensions
    if (draft) return draft
    // SSR-safe default; useEffect below re-seeds based on actual locale if no draft.
    return DEFAULT_DIMENSIONS_BY_LOCALE.zh
  })
  // If there is no draft and the user is in EN, swap the default once on mount.
  useEffect(() => {
    if (loadDraft()?.dimensions) return
    setDimensions(DEFAULT_DIMENSIONS_BY_LOCALE[locale])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [newDimName, setNewDimName] = useState('')
  const [expandedDescs, setExpandedDescs] = useState<Set<number>>(new Set())

  const [savedAt, setSavedAt] = useState<string | null>(() => loadDraft() ? fmtTime(new Date()) : null)

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (isClearingRef.current) {
      isClearingRef.current = false
      return
    }
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, track, description, dimensions, mode, tracks, models, regOpen, regAutoApprove, regDeadline, subDeadline, startTime, resultAnnouncedAt, registrationOpenAt, judgingStartAt, customFields }))
      setSavedAt(fmtTime(new Date()))
    }, 1000)
    return () => clearTimeout(timer)
  }, [name, track, description, dimensions, mode, tracks, models, regOpen, regAutoApprove, regDeadline, subDeadline, startTime, resultAnnouncedAt, registrationOpenAt, judgingStartAt, customFields])

  const clearDraft = () => {
    isClearingRef.current = true
    localStorage.removeItem(DRAFT_KEY)
    setName('')
    setTrack('')
    setDescription('')
    setMode('ai_only')
    setModels([...ALL_MODEL_KEYS])
    setTracks([])
    setDimensions(DEFAULT_DIMENSIONS_BY_LOCALE[locale])
    setExpandedDescs(new Set())
    setSavedAt(null)
    setRegOpen(false)
    setRegAutoApprove(false)
    setRegDeadline('')
    setSubDeadline('')
    setStartTime('')
    setResultAnnouncedAt('')
    setRegistrationOpenAt('')
    setJudgingStartAt('')
    setCustomFields([])
    setNewFieldType('text')
    setNewFieldOptions([])
    setNewOptionInput('')
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

  const updateDescription = (index: number, value: string) => {
    setDimensions(dims => dims.map((d, i) => i === index ? { ...d, description: value || undefined } : d))
  }

  const toggleDescExpanded = (index: number) => {
    setExpandedDescs(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const addTrack = () => setTracks(prev => [...prev, { id: genTrackId(), name: '' }])
  const removeTrack = (idx: number) => setTracks(prev => prev.filter((_, i) => i !== idx))
  const updateTrack = (idx: number, field: keyof Track, value: string) =>
    setTracks(prev => prev.map((tr, i) => i === idx ? { ...tr, [field]: value } : tr))

  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0)

  const addDimension = () => {
    if (!newDimName.trim()) return
    if (dimensions.length >= 8) {
      toast.error(locale === 'zh' ? '最多添加 8 个评分维度' : 'Max 8 scoring dimensions')
      return
    }
    const newWeight = Math.floor(100 / (dimensions.length + 1))
    const adjustedDimensions = dimensions.map(d => ({ ...d, weight: newWeight }))
    const remainder = 100 - newWeight * (dimensions.length + 1)
    setDimensions([...adjustedDimensions, { name: newDimName.trim(), weight: newWeight + remainder }])
    setNewDimName('')
  }

  const removeDimension = (index: number) => {
    if (dimensions.length <= 1) return
    const newDims = dimensions.filter((_, i) => i !== index)
    const totalW = newDims.reduce((s, d) => s + d.weight, 0)
    if (totalW !== 100 && newDims.length > 0) {
      const diff = 100 - totalW
      newDims[0].weight += diff
    }
    setDimensions(newDims)
  }

  const updateWeight = (index: number, value: number) => {
    const clamped = Math.min(100, Math.max(1, value || 0))
    const newDims = dimensions.map((d, i) => i === index ? { ...d, weight: clamped } : d)
    setDimensions(newDims)
  }

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return
    setAiGenerating(true)
    try {
      const res = await fetch('/api/ai/generate-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('ai.generateError'))

      if (data.name) setName(data.name)
      if (data.track) setTrack(data.track)
      if (data.description) setDescription(data.description)
      if (Array.isArray(data.tracks)) setTracks(data.tracks)
      if (Array.isArray(data.dimensions) && data.dimensions.length > 0) setDimensions(data.dimensions)
      if (Array.isArray(data.models)) setModels(data.models)

      toast.success(t('ai.generateSuccess'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('ai.generateError'))
    } finally {
      setAiGenerating(false)
    }
  }

  const handleNext = () => {
    if (step === 1) {
      if (!name.trim()) {
        toast.error(locale === 'zh' ? '请输入活动名称' : 'Please enter event name')
        return
      }
    }
    if (step === 2) {
      if (totalWeight !== 100) {
        toast.error(locale === 'zh' ? `评分权重之和必须为 100，当前为 ${totalWeight}` : `Total weight must be 100, current: ${totalWeight}`)
        return
      }
    }
    setStep(s => s + 1)
  }

  const toggleModel = (key: string) => {
    setModels(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const estimatedCredits = models.reduce((sum, k) => sum + (MODEL_CREDITS[k] ?? 1), 0)

  const handleCreate = async () => {
    if (totalWeight !== 100) {
      toast.error(locale === 'zh' ? '评分权重之和必须为 100' : 'Total weight must be 100')
      return
    }
    if (models.length === 0) {
      toast.error(t('models.selectAtLeastOne'))
      return
    }

    setLoading(true)
    try {
      const defaultFields = [
        { key: 'team_name', label: t('reg.teamName'), type: 'text', required: true, default: true },
        { key: 'github_url', label: t('reg.githubUrl'), type: 'url', required: false, default: true },
        ...(tracks.filter(tr => tr.name.trim()).length > 0
          ? [{ key: 'track_id', label: t('reg.trackSelect'), type: 'text', required: false, default: true }]
          : []),
      ]
      const allFields = [...defaultFields, ...customFields]

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          track: track.trim() || null,
          description: description.trim() || null,
          dimensions,
          models,
          web3_enabled: false,
          mode,
          tracks: tracks.filter(tr => tr.name.trim()),
          banner_url: bannerUrl || null,
          registration_deadline: regDeadline || null,
          submission_deadline: subDeadline || null,
          start_time: startTime ? new Date(startTime).toISOString() : null,
          result_announced_at: resultAnnouncedAt ? new Date(resultAnnouncedAt).toISOString() : null,
          registration_open_at: registrationOpenAt ? new Date(registrationOpenAt).toISOString() : null,
          judging_start_at: judgingStartAt ? new Date(judgingStartAt).toISOString() : null,
          registration_config: { open: regOpen, auto_approve: regAutoApprove, fields: allFields },
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || (locale === 'zh' ? '创建失败' : 'Create failed'))

      localStorage.removeItem(DRAFT_KEY)
      toast.success(locale === 'zh' ? '活动创建成功！' : 'Event created!')
      router.push(`/events/${data.id}/import`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (locale === 'zh' ? '创建失败，请重试' : 'Create failed, please try again'))
    } finally {
      setLoading(false)
    }
  }

  const activeTracks = tracks.filter(tr => tr.name.trim())

  const typeLabel = (type: CustomField['type']) => {
    const map: Record<CustomField['type'], { zh: string; en: string }> = {
      text: { zh: '短文本', en: 'Text' },
      textarea: { zh: '长文本', en: 'Textarea' },
      url: { zh: '网址', en: 'URL' },
      select: { zh: '单选', en: 'Select' },
      multiselect: { zh: '多选', en: 'Multi-select' },
    }
    return locale === 'zh' ? map[type].zh : map[type].en
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{locale === 'zh' ? '创建 Hackathon' : 'Create Hackathon'}</h1>
          <p className="text-muted-foreground text-sm mt-1">{locale === 'zh' ? '按步骤配置您的 Hackathon 活动' : 'Configure your hackathon step by step'}</p>
        </div>
        {savedAt !== null && (
          <div className="flex items-center gap-2 mt-1 text-xs text-fg-subtle">
            <span>{locale === 'zh' ? `已自动保存 ${savedAt}` : `Auto-saved ${savedAt}`}</span>
            <span>·</span>
            <button type="button" onClick={clearDraft} className="hover:text-[var(--color-fg-muted)] transition-colors underline underline-offset-2">
              {locale === 'zh' ? '清除草稿' : 'Clear draft'}
            </button>
          </div>
        )}
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step > s
                  ? 'bg-[var(--color-fg)] text-white'
                  : step === s
                  ? 'bg-[var(--color-fg)] text-white'
                  : 'bg-surface-2 text-fg-subtle'
              }`}
            >
              {step > s ? <Check size={14} /> : s}
            </div>
            <span className={`text-sm ${step === s ? 'font-medium' : 'text-muted-foreground'}`}>
              {s === 1
                ? (locale === 'zh' ? '基本信息' : 'Basic Info')
                : (locale === 'zh' ? '评分维度' : 'Dimensions')}
            </span>
            {s < 2 && <ChevronRight size={14} className="text-fg-subtle ml-1" />}
          </div>
        ))}
      </div>

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <>
        <div className="mb-4 rounded-xl border border-dashed border-token bg-[var(--color-surface)]/60 p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
            <Sparkles size={15} className="text-amber-500" />
            <span>{t('ai.generateEvent')}</span>
          </div>
          <Textarea
            placeholder={t('ai.generateEventPrompt')}
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            rows={3}
            className="text-sm resize-none bg-bg"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={aiGenerating || !aiPrompt.trim()}
            onClick={handleAiGenerate}
            className="gap-1.5"
          >
            {aiGenerating ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                {t('ai.generating')}
              </>
            ) : (
              <>
                <Sparkles size={13} />
                {t('ai.generateEventBtn')}
              </>
            )}
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{locale === 'zh' ? '活动基本信息' : 'Basic Info'}</CardTitle>
            <CardDescription>{locale === 'zh' ? '填写活动名称和描述' : 'Fill in the event name and description'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                {locale === 'zh' ? '活动名称' : 'Event Name'} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder={locale === 'zh' ? '如：2024 Web3 黑客松' : 'e.g. 2024 Web3 Hackathon'}
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{locale === 'zh' ? '活动描述（可选）' : 'Description (optional)'}</Label>
              <RichEditor
                value={description}
                onChange={setDescription}
                placeholder={locale === 'zh' ? '描述本次 Hackathon 的主题、背景、奖励...' : 'Describe the hackathon theme, background, prizes...'}
              />
            </div>
            <div className="space-y-2">
              <ImageUpload
                value={bannerUrl || null}
                onChange={url => setBannerUrl(url)}
                bucket="event-banners"
                path="tmp"
                label={t('upload.banner')}
                aspectRatio="banner"
              />
            </div>
            <div className="space-y-2">
              <Label>{locale === 'zh' ? '评审模式' : 'Review Mode'}</Label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-colors ${
                    mode === 'ai_only' ? 'border-[var(--color-fg)] bg-[var(--color-fg)]/5' : 'border-token hover:border-[var(--color-border-strong)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value="ai_only"
                    checked={mode === 'ai_only'}
                    onChange={() => setMode('ai_only')}
                    className="sr-only"
                  />
                  <span className="font-medium text-sm">{locale === 'zh' ? 'AI 评审' : 'AI Review'}</span>
                  <span className="text-xs text-muted-foreground">{locale === 'zh' ? '由 AI 模型自动打分，管理员可调整' : 'AI scores automatically, admin can adjust'}</span>
                </label>
                <label
                  className={`flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-colors ${
                    mode === 'panel_review' ? 'border-[var(--color-fg)] bg-[var(--color-fg)]/5' : 'border-token hover:border-[var(--color-border-strong)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value="panel_review"
                    checked={mode === 'panel_review'}
                    onChange={() => setMode('panel_review')}
                    className="sr-only"
                  />
                  <span className="font-medium text-sm">{locale === 'zh' ? '多人评审' : 'Panel Review'}</span>
                  <span className="text-xs text-muted-foreground">{locale === 'zh' ? '邀请多位评委，各自用 AI 辅助打分后汇总' : 'Invite judges to score with AI assistance'}</span>
                </label>
              </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('models.title')}</Label>
                <span className="text-xs text-muted-foreground">
                  {t('models.estimatedCost')}<span className="font-semibold text-fg-muted">{estimatedCredits}</span> {t('models.creditsUnit')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{t('models.description')}</p>
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
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('track.label')}{locale === 'zh' ? '（可选）' : ' (optional)'}</Label>
                <span className="text-xs text-muted-foreground">{locale === 'zh' ? '支持多赛道分类' : 'Supports multi-track'}</span>
              </div>
              <div className="space-y-2">
                {tracks.map((tr, idx) => (
                  <div key={tr.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder={t('track.placeholder')}
                        value={tr.name}
                        onChange={e => updateTrack(idx, 'name', e.target.value)}
                        className="flex-1 h-8 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeTrack(idx)}
                        className="text-fg-subtle hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder={t('track.description') + (locale === 'zh' ? '（可选）' : ' (optional)')}
                        value={tr.description ?? ''}
                        onChange={e => updateTrack(idx, 'description', e.target.value)}
                        className="h-7 text-xs"
                      />
                      <Input
                        placeholder={t('track.prize') + (locale === 'zh' ? '（可选）' : ' (optional)')}
                        value={tr.prize ?? ''}
                        onChange={e => updateTrack(idx, 'prize', e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTrack}
                className="gap-1.5 w-full"
              >
                <Plus size={14} />
                {t('track.add')}
              </Button>
            </div>
            </div>
          </CardContent>
        </Card>

        {/* Registration Config */}
        <Card className="mt-4">
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
                {/* Timeline 时间轴 */}
                <div className="space-y-0">
                  <p className="text-sm font-medium mb-3">{locale === 'zh' ? '活动时间轴' : 'Event Timeline'}</p>
                  {[
                    {
                      label: locale === 'zh' ? '① 活动开始' : '① Hackathon Start',
                      value: startTime,
                      setter: setStartTime,
                      hint: locale === 'zh' ? '对外公示活动启动时间' : 'When the hackathon officially kicks off',
                    },
                    {
                      label: locale === 'zh' ? '② 报名开放' : '② Registration Opens',
                      value: registrationOpenAt,
                      setter: setRegistrationOpenAt,
                      hint: locale === 'zh' ? '可选，不填则立即开放报名' : 'Optional — leave blank to open immediately',
                    },
                    {
                      label: locale === 'zh' ? '③ 报名截止' : '③ Registration Deadline',
                      value: regDeadline,
                      setter: setRegDeadline,
                      hint: '',
                    },
                    {
                      label: locale === 'zh' ? '④ 项目提交截止' : '④ Submission Deadline',
                      value: subDeadline,
                      setter: setSubDeadline,
                      hint: '',
                    },
                    {
                      label: locale === 'zh' ? '⑤ 评审开始' : '⑤ Judging Starts',
                      value: judgingStartAt,
                      setter: setJudgingStartAt,
                      hint: locale === 'zh' ? '可选，不填则提交截止后立即开始' : 'Optional — defaults to after submission closes',
                    },
                    {
                      label: locale === 'zh' ? '⑥ 结果公布' : '⑥ Results Announced',
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
                    <p className="text-xs text-red-500 ml-5">{locale === 'zh' ? '报名截止必须早于提交截止' : 'Registration deadline must be before submission deadline'}</p>
                  )}
                </div>
                <Separator />
                <div className="border border-token rounded-xl p-4 bg-[var(--color-surface)]/50 space-y-4">
                  {/* Default Fields */}
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium">{locale === 'zh' ? '默认字段' : 'Default Fields'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {locale === 'zh' ? '以下字段将自动包含在报名表中' : 'The following fields are automatically included in the registration form'}
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
                    <p className="text-sm font-medium">{locale === 'zh' ? '自定义字段' : 'Custom Fields'}</p>

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
                                {locale === 'zh' ? '必填' : 'Required'}
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
                        {locale === 'zh' ? '快速添加常用字段' : 'Quick add common fields'}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {FIELD_TEMPLATES.map(tpl => {
                          const tplLabel = locale === 'zh' ? tpl.label.zh : tpl.label.en
                          const isAdded = customFields.some(cf => cf.label === tplLabel)
                          return (
                            <button
                              key={tpl.label.en}
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
                      <p className="text-xs text-muted-foreground">{locale === 'zh' ? '或自定义字段' : 'Or add a custom field'}</p>
                      <div className="flex gap-2">
                        <Input
                          placeholder={locale === 'zh' ? '例：项目简介' : 'e.g. Project Summary'}
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
                          <option value="text">{locale === 'zh' ? '短文本' : 'Text'}</option>
                          <option value="textarea">{locale === 'zh' ? '长文本' : 'Textarea'}</option>
                          <option value="url">{locale === 'zh' ? '网址' : 'URL'}</option>
                          <option value="select">{locale === 'zh' ? '单选' : 'Select'}</option>
                          <option value="multiselect">{locale === 'zh' ? '多选' : 'Multi-select'}</option>
                        </select>
                      </div>
                      {(newFieldType === 'select' || newFieldType === 'multiselect') && (
                        <div className="space-y-1.5 pl-0.5">
                          <div className="flex gap-2">
                            <Input
                              placeholder={locale === 'zh' ? '输入选项，按回车添加' : 'Type option and press Enter'}
                              value={newOptionInput}
                              onChange={e => setNewOptionInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewOption() } }}
                              className="text-sm bg-bg h-8"
                            />
                            <Button type="button" variant="outline" size="sm" onClick={addNewOption} className="shrink-0 h-8 bg-bg">
                              {locale === 'zh' ? '添加' : 'Add'}
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
                        {locale === 'zh' ? '+ 添加字段' : '+ Add Field'}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        </>
      )}

      {/* Step 2: Dimensions */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>{locale === 'zh' ? '评分维度配置' : 'Scoring Dimensions'}</CardTitle>
            <CardDescription>
              {locale === 'zh' ? '自定义评审维度和权重，权重总和必须为 100%' : 'Customize dimensions and weights, total must be 100%'}
              <span
                className={`ml-2 font-medium ${
                  totalWeight === 100 ? 'text-green-600' : 'text-red-500'
                }`}
              >
                {locale === 'zh' ? `当前总权重：${totalWeight}%` : `Current total: ${totalWeight}%`}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">{locale === 'zh' ? '快速选择模板：' : 'Quick templates:'}</p>
              <div className="flex gap-2 flex-wrap">
                {DIMENSION_TEMPLATES_LOCALIZED.map(tpl => (
                  <Button
                    key={tpl.label.en}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setDimensions(pickLocalizedDimensions(locale, tpl)); setExpandedDescs(new Set()) }}
                  >
                    {locale === 'zh' ? tpl.label.zh : tpl.label.en}
                  </Button>
                ))}
              </div>
            </div>
            {dimensions.map((dim, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-sm font-medium">{dim.name}</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    defaultValue={dim.weight}
                    key={`${index}-${dim.weight}`}
                    onBlur={e => updateWeight(index, parseInt(e.target.value))}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className="w-[60px] border rounded px-2 py-1 text-sm text-right"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                  <button
                    type="button"
                    onClick={() => toggleDescExpanded(index)}
                    className={`transition-colors ${expandedDescs.has(index) ? 'text-fg-muted' : 'text-fg-subtle hover:text-[var(--color-fg-muted)]'}`}
                    title={locale === 'zh' ? '编辑评分标准说明' : 'Edit scoring criteria'}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDimension(index)}
                    className="text-fg-subtle hover:text-red-500 transition-colors"
                    disabled={dimensions.length <= 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {expandedDescs.has(index) && (
                  <textarea
                    className="w-full border rounded px-2 py-1 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-gray-300"
                    placeholder={locale === 'zh' ? '评分标准说明（可选）' : 'Scoring criteria (optional)'}
                    rows={2}
                    value={dim.description || ''}
                    onChange={e => updateDescription(index, e.target.value)}
                  />
                )}
              </div>
            ))}

            {dimensions.length < 8 && (
              <>
                <Separator />
                <div className="flex gap-2">
                  <Input
                    placeholder={locale === 'zh' ? '添加新维度名称' : 'New dimension name'}
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
      )}

      {/* Navigation buttons */}
      <div className="flex justify-between mt-6">
        {step > 1 ? (
          <Button variant="outline" onClick={() => setStep(s => s - 1)}>
            <ChevronLeft size={14} className="mr-1" />
            {locale === 'zh' ? '上一步' : 'Back'}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => router.back()}>
            {locale === 'zh' ? '取消' : 'Cancel'}
          </Button>
        )}

        {step < 2 ? (
          <Button onClick={handleNext}>
            {locale === 'zh' ? '下一步' : 'Next'}
            <ChevronRight size={14} className="ml-1" />
          </Button>
        ) : (
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? (locale === 'zh' ? '创建中...' : 'Creating...') : (locale === 'zh' ? '创建活动' : 'Create Event')}
          </Button>
        )}
      </div>
    </div>
  )
}
