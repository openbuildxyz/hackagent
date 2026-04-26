'use client'

import { useState, useEffect, useCallback } from 'react'
import { Key, Plus, Trash2, Copy, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT, useLocale, type TranslationKey } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { copyToClipboard } from '@/components/CopyButton'
import { formatDateLong } from '@/lib/format-date'

type ApiKey = {
  id: string
  name: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

type NewKeyResult = ApiKey & { key: string }

export default function ApiKeysPage() {
  const t = useT()
  const [locale] = useLocale()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKey, setNewKey] = useState<NewKeyResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)

  const formatDate = (d: string) => formatDateLong(d, locale)

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/api-keys')
      if (res.ok) setKeys(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? t('apiKeys.create.failed'))
        return
      }
      const data: NewKeyResult = await res.json()
      setNewKey(data)
      setShowCreate(false)
      setNewName('')
      fetchKeys()
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm(t('apiKeys.confirmRevoke'))) return
    setRevoking(id)
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success(t('apiKeys.revokeSuccess'))
        fetchKeys()
      } else {
        const err = await res.json()
        toast.error(err.error ?? t('apiKeys.revokeFailed'))
      }
    } finally {
      setRevoking(null)
    }
  }

  async function handleCopy(text: string) {
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(true)
      toast.success(t('common.copiedToast'))
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error(t('common.copyFailed'))
    }
  }

  const activeKeys = keys.filter(k => !k.revoked_at)
  const revokedKeys = keys.filter(k => k.revoked_at)

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key size={22} /> {t('apiKeys.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('apiKeys.subtitle')}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus size={14} className="mr-1.5" /> {t('apiKeys.newKey')}
        </Button>
      </div>

      {/* Create dialog */}
      {showCreate && (
        <Card className="mb-6 border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('apiKeys.create.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm font-medium">{t('apiKeys.create.nameLabel')}</label>
              <input
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t('apiKeys.create.namePlaceholder')}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || creating}>
                {creating && <Loader2 size={13} className="mr-1.5 animate-spin" />}
                {t('apiKeys.create.generate')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowCreate(false); setNewName('') }}>
                {t('apiKeys.create.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Newly created key — shown once */}
      {newKey && (
        <Card className="mb-6 border-green-300 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-green-800">
              {t('apiKeys.created.title').replace('{name}', newKey.name)}
            </CardTitle>
            <CardDescription className="text-green-700">
              {t('apiKeys.created.saveOnce')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 bg-bg border rounded-md px-3 py-2 font-mono text-sm break-all">
              <span className="flex-1">{newKey.key}</span>
              <Button
                size="icon"
                variant="ghost"
                className="shrink-0 h-7 w-7"
                onClick={() => handleCopy(newKey.key)}
              >
                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              </Button>
            </div>
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => setNewKey(null)}
            >
              {t('apiKeys.created.saved')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active keys */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 size={16} className="animate-spin" /> {t('apiKeys.loading')}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {activeKeys.length === 0 && !showCreate && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t('apiKeys.noActive')}
              </p>
            )}
            {activeKeys.map(k => (
              <Card key={k.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{k.name}</span>
                      <Badge variant="secondary" className="font-mono text-xs">{k.key_prefix}…</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('apiKeys.created').replace('{date}', formatDate(k.created_at))}
                      {k.last_used_at && ` · ${t('apiKeys.lastUsed').replace('{date}', formatDate(k.last_used_at))}`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleRevoke(k.id)}
                    disabled={revoking === k.id}
                  >
                    {revoking === k.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />
                    }
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {revokedKeys.length > 0 && (
            <div className="mt-8">
              <h2 className="text-sm font-medium text-muted-foreground mb-2">{t('apiKeys.revokedSection')}</h2>
              <div className="space-y-2">
                {revokedKeys.map(k => (
                  <Card key={k.id} className="opacity-50">
                    <CardContent className="flex items-center justify-between py-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm line-through">{k.name}</span>
                          <Badge variant="outline" className="font-mono text-xs">{k.key_prefix}…</Badge>
                          <Badge variant="destructive" className="text-xs">{t('apiKeys.revoked')}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t('apiKeys.revokedAt').replace('{date}', formatDate(k.revoked_at!))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Quick start */}
      <Card className="mt-8 bg-surface">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('apiKeys.title')} — {t('apiKeys.quickStart')}</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1.5 font-mono">
          <p>Authorization: Bearer ***</p>
          <p className="font-sans text-xs">{t('apiKeys.supportedEndpoints')}</p>
          <p>GET  /api/v1/events</p>
          <p>GET  /api/v1/events/:id</p>
          <p>POST /api/v1/events/:id/register</p>
          <p>POST /api/v1/events/:id/submit</p>
          <p>GET  /api/v1/events/:id/my-registration</p>
          <p>GET  /api/v1/events/:id/result</p>
          <p>POST /api/v1/events  ({t('apiKeys.adminOnly')})</p>
        </CardContent>
        <CardContent className="pt-0 flex items-center gap-4">
          <a href="/api-docs" target="_blank"
            className="text-xs text-indigo-600 hover:underline font-sans font-medium">
            📄 {t('apiKeys.docsLink')}
          </a>
          <CopySkillInline t={t} />
        </CardContent>
      </Card>
    </div>
  )
}

function CopySkillInline({ t }: { t: (k: TranslationKey) => string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    try {
      const res = await fetch('/skills/hackagent/SKILL.md')
      if (!res.ok) throw new Error('fetch failed')
      const text = await res.text()
      const ok = await copyToClipboard(text)
      if (!ok) throw new Error('clipboard failed')
      setCopied(true)
      toast.success(t('apiKeys.copySkillDone'))
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(t('apiKeys.copySkillFail'))
    }
  }
  return (
    <button
      type="button"
      onClick={handle}
      className="text-xs text-indigo-600 hover:underline font-sans font-medium inline-flex items-center gap-1"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      🤖 {copied ? t('apiKeys.copySkillDone') : t('apiKeys.copySkill')}
    </button>
  )
}
