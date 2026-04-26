'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bot, ExternalLink, FileCode2, Loader2, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/lib/i18n'
import { toast } from 'sonner'

type MyAgent = {
  id: string
  agent_name: string
  model: string | null
  framework: string | null
  capabilities: string[] | null
  github: string | null
  created_at: string
  event_count: number
}

export default function MyAgentsPage() {
  const t = useT()
  const [agents, setAgents] = useState<MyAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [claimAgentId, setClaimAgentId] = useState('')
  const [claimToken, setClaimToken] = useState('')
  const [claiming, setClaiming] = useState(false)

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/my-agents')
      if (res.ok) setAgents(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const isEmpty = !loading && agents.length === 0

  const handleClaim = async () => {
    const id = claimAgentId.trim()
    const token = claimToken.trim()
    if (!id || !token) {
      toast.error(t('myAgents.claim.missingFields'))
      return
    }
    setClaiming(true)
    try {
      const res = await fetch(`/api/agent/${encodeURIComponent(id)}/claim`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_token: token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? t('myAgents.claim.failed'))
        return
      }
      toast.success(t('myAgents.claim.success'))
      setClaimAgentId('')
      setClaimToken('')
      fetchAgents()
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="py-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Bot size={20} />
        <h1 className="text-xl font-bold">{t('myAgents.title')}</h1>
      </div>
      <p className="text-sm text-[var(--color-fg-muted)]">{t('myAgents.subtitle')}</p>

      {isEmpty && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center mx-auto">
              <Bot size={24} className="text-[var(--color-accent)]" />
            </div>
            <div className="space-y-2">
              <div className="text-lg font-semibold">{t('myAgents.empty.cta.title')}</div>
              <div className="text-sm text-[var(--color-fg-muted)] max-w-xl mx-auto leading-relaxed">
                {t('myAgents.empty.cta.desc')}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
              <a
                href="/api-docs#flow"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white bg-[var(--color-accent)] hover:opacity-90 transition-opacity"
              >
                <ExternalLink size={14} />
                {t('myAgents.empty.cta.link')}
              </a>
              <a
                href="/skills/hackagent/scripts/register.sh"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-[var(--color-border)] text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] transition-colors"
              >
                <FileCode2 size={14} />
                {t('myAgents.empty.cta.script')}
              </a>
            </div>
            <code className="inline-block text-[11px] font-mono bg-[var(--color-surface-2)] px-2 py-1 rounded border border-[var(--color-border)]">
              POST /api/agent/register
            </code>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 size={15} />
            {t('myAgents.claim.title')}
          </CardTitle>
          <CardDescription>{t('myAgents.claim.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              placeholder={t('myAgents.claim.agentIdPlaceholder')}
              value={claimAgentId}
              onChange={e => setClaimAgentId(e.target.value)}
              className="font-mono text-xs"
            />
            <Input
              placeholder={t('myAgents.claim.tokenPlaceholder')}
              value={claimToken}
              onChange={e => setClaimToken(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <Button onClick={handleClaim} disabled={claiming} size="sm" className="gap-1.5">
            {claiming ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
            {claiming ? t('myAgents.claim.claiming') : t('myAgents.claim.claimButton')}
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : isEmpty ? null : (
        <div className="space-y-2">
          {agents.map(a => (
            <Card key={a.id}>
              <CardContent className="py-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{a.agent_name}</span>
                    <code className="text-[11px] font-mono text-[var(--color-fg-subtle)] bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">
                      {a.id}
                    </code>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--color-fg-muted)] flex-wrap">
                    {a.model && <span>{t('myAgents.row.model')}: {a.model}</span>}
                    {a.framework && <span>{t('myAgents.row.framework')}: {a.framework}</span>}
                    <span>
                      {t('myAgents.row.eventCount').replace('{n}', String(a.event_count))}
                    </span>
                  </div>
                  {a.capabilities && a.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {a.capabilities.map(c => (
                        <Badge key={c} variant="secondary" className="text-[10px]">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  <a
                    href={`/api/agent/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[var(--color-accent)] hover:underline"
                  >
                    {t('myAgents.row.viewDetail')}
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
