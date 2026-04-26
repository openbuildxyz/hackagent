'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ArrowLeft, Copy, Check, Vote } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { copyToClipboard } from '@/components/CopyButton'

type VoteConfig = {
  enabled: boolean
  title: string
  description: string
  vote_limit: number
  ends_at: string
  visible_fields: string[]
  show_ai_score: boolean
  show_realtime_count: boolean
}

const DEFAULT_CONFIG: VoteConfig = {
  enabled: false,
  title: '',
  description: '',
  vote_limit: 3,
  ends_at: '',
  visible_fields: ['description', 'demo_url', 'tags'],
  show_ai_score: false,
  show_realtime_count: true,
}

export default function VoteConfigPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const t = useT()
  const [config, setConfig] = useState<VoteConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const VISIBLE_FIELD_OPTIONS: { value: string; label: string }[] = [
    { value: 'description', label: t('vote.fieldDescription') },
    { value: 'demo_url', label: t('vote.fieldDemo') },
    { value: 'github_url', label: t('vote.fieldGithub') },
    { value: 'tags', label: t('vote.fieldTags') },
  ]

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/vote/${id}`
    : `https://hackathon.xyz/vote/${id}`

  useEffect(() => {
    fetch(`/api/events/${id}/vote-config`)
      .then((r) => r.json())
      .then((data) => {
        if (data.public_vote) {
          setConfig({ ...DEFAULT_CONFIG, ...data.public_vote })
        }
      })
      .catch(() => toast.error('加载配置失败'))
      .finally(() => setLoading(false))
  }, [id])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/events/${id}/vote-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_vote: config }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || '保存失败')
        return
      }
      toast.success('投票配置已保存')
    } finally {
      setSaving(false)
    }
  }

  function toggleField(field: string) {
    setConfig((c) => ({
      ...c,
      visible_fields: c.visible_fields.includes(field)
        ? c.visible_fields.filter((f) => f !== field)
        : [...c.visible_fields, field],
    }))
  }

  async function copyLink() {
    const ok = await copyToClipboard(publicUrl)
    if (ok) {
      setCopied(true)
      toast.success(t('common.copiedToast'))
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error(t('common.copyFailed'))
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <div className="text-muted-foreground text-sm">加载中...</div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Link
        href={`/events/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft size={14} />
        返回活动
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <Vote size={24} className="text-purple-600" />
        <h1 className="text-2xl font-bold">投票配置</h1>
      </div>

      <div className="space-y-6">
        {/* Enable toggle */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{t('vote.enable')}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{t('vote.enableDesc')}</p>
              </div>
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${config.enabled ? 'bg-purple-600' : 'bg-surface-2'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-bg shadow transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Basic info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('vote.basicInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="vote-title">{t('vote.pageTitle')}</Label>
              <Input
                id="vote-title"
                placeholder="例：OpenBuild Hackathon 投票"
                value={config.title}
                onChange={(e) => setConfig((c) => ({ ...c, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('vote.descLabel')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-fg-subtle mb-1">Markdown</p>
                  <Textarea
                    id="vote-desc"
                    placeholder={t('vote.descPlaceholder')}
                    value={config.description}
                    onChange={(e) => setConfig((c) => ({ ...c, description: e.target.value }))}
                    rows={6}
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <p className="text-xs text-fg-subtle mb-1">{t('vote.preview')}</p>
                  <div className="min-h-[132px] rounded-md border border-token bg-surface px-3 py-2 text-sm prose prose-sm max-w-none">
                    {config.description ? (
                      <ReactMarkdown remarkPlugins={[remarkBreaks, remarkGfm]}>{config.description}</ReactMarkdown>
                    ) : (
                      <span className="text-fg-subtle">{t('vote.descPlaceholder')}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rules */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('vote.rules')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="vote-limit">{t('vote.voteLimit')}</Label>
              <select
                id="vote-limit"
                value={config.vote_limit}
                onChange={(e) => setConfig((c) => ({ ...c, vote_limit: Number(e.target.value) }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n} {t('vote.voteSuffix')}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vote-ends">{t('vote.endsAt')}</Label>
              <Input
                id="vote-ends"
                type="datetime-local"
                value={config.ends_at}
                onChange={(e) => setConfig((c) => ({ ...c, ends_at: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Visible fields */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('vote.visibleFields')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {VISIBLE_FIELD_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.visible_fields.includes(opt.value)}
                  onChange={() => toggleField(opt.value)}
                  className="h-4 w-4 rounded border-token-strong text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.show_ai_score}
                onChange={(e) => setConfig((c) => ({ ...c, show_ai_score: e.target.checked }))}
                className="h-4 w-4 rounded border-token-strong text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm">{t('vote.fieldAiScore')}</span>
            </label>
          </CardContent>
        </Card>

        {/* Display options */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{t('vote.showRealtime')}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{t('vote.showRealtimeDesc')}</p>
              </div>
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, show_realtime_count: !c.show_realtime_count }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${config.show_realtime_count ? 'bg-purple-600' : 'bg-surface-2'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-bg shadow transition-transform ${config.show_realtime_count ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Public link */}
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="text-base text-purple-800">{t('vote.publicLink')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={publicUrl}
                className="bg-bg text-sm font-mono"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copyLink}
                className="shrink-0"
              >
                {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
              </Button>
            </div>
            <p className="text-xs text-purple-700">
              {t('vote.publicLinkDesc')}
            </p>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex gap-3">
          <Button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-700 text-white">
            {saving ? t('common.saving') : t('vote.save')}
          </Button>
          <Button variant="outline" onClick={() => router.push(`/events/${id}`)}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}
