'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, PlayCircle, Settings, Wifi, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

type EnvStatus = {
  name: string
  configured: boolean
  secret: boolean
}

type ModelConfig = {
  key: string
  displayName: string
  modelId: string
  provider: string
  baseUrl: string
  env: EnvStatus[]
  configured: boolean
  credits: number
  temperature: number
  notes: string
}

type ServiceConfig = {
  key: string
  name: string
  provider: string
  baseUrl: string
  env: EnvStatus[]
  status: 'configured' | 'missing'
  notes: string
}

type ConfigSnapshot = {
  readOnly: true
  readOnlyReason: string
  models: ModelConfig[]
  services: ServiceConfig[]
}

type TestResult = {
  ok: boolean
  status: 'ok' | 'warning' | 'error' | 'missing'
  latencyMs: number
  message: string
  httpStatus?: number
  checkedAt: string
}

function StatusBadge({ configured, labelConfigured, labelMissing }: { configured: boolean; labelConfigured: string; labelMissing: string }) {
  return configured ? (
    <Badge className="border-green-200 bg-green-50 text-green-700 hover:bg-green-50"><CheckCircle2 size={12} className="mr-1" />{labelConfigured}</Badge>
  ) : (
    <Badge className="border-red-200 bg-red-50 text-red-700 hover:bg-red-50"><XCircle size={12} className="mr-1" />{labelMissing}</Badge>
  )
}

function EnvList({
  env,
  secretLabel,
  secretTitle,
  nonSecretTitle,
}: {
  env: EnvStatus[]
  secretLabel: string
  secretTitle: string
  nonSecretTitle: string
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {env.map((item) => (
        <span
          key={`${item.name}-${item.secret}`}
          title={item.secret ? secretTitle : nonSecretTitle}
          className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${
            item.configured
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]'
          }`}
        >
          {item.name}{item.secret ? ` ${secretLabel}` : ''}
        </span>
      ))}
    </div>
  )
}

export default function AdminModelConfigPage() {
  const t = useT()
  const [config, setConfig] = useState<ConfigSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState<string[]>([])
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const [results, setResults] = useState<Record<string, TestResult>>({})

  const modelNote = (key: string) => key === 'kimi' ? t('admin.model.noteKimi') : t('admin.model.noteDefault')
  const serviceName = (key: string, fallback: string) => {
    const names: Record<string, string> = {
      'event-generation': t('admin.model.service.eventGeneration'),
      'code-analysis': t('admin.model.service.codeAnalysis'),
      'team-auto-match': t('admin.model.service.teamAutoMatch'),
      'image-generation': t('admin.model.service.imageGeneration'),
      'github-enrichment': t('admin.model.service.githubEnrichment'),
      web3insight: t('admin.model.service.web3insight'),
      sonar: t('admin.model.service.sonar'),
      'zenmux-vertex': t('admin.model.service.zenmuxVertex'),
    }
    return names[key] ?? fallback
  }
  const serviceNote = (key: string, fallback: string) => {
    const notes: Record<string, string> = {
      'event-generation': t('admin.model.service.eventGenerationDesc'),
      'code-analysis': t('admin.model.service.codeAnalysisDesc'),
      'team-auto-match': t('admin.model.service.teamAutoMatchDesc'),
      'image-generation': t('admin.model.service.imageGenerationDesc'),
      'github-enrichment': t('admin.model.service.githubEnrichmentDesc'),
      web3insight: t('admin.model.service.web3insightDesc'),
      sonar: t('admin.model.service.sonarDesc'),
      'zenmux-vertex': t('admin.model.service.zenmuxVertexDesc'),
    }
    return notes[key] ?? fallback
  }

  useEffect(() => {
    fetch('/api/admin/model-config')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('admin.model.loadFailed'))
        setConfig(data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('admin.model.loadFailed')))
      .finally(() => setLoading(false))
  }, [t])

  async function runConnectionTest(type: 'model' | 'service', key: string): Promise<TestResult> {
    const id = `${type}:${key}`
    setTesting((prev) => [...new Set([...prev, id])])
    try {
      const res = await fetch('/api/admin/model-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, key }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && !data.status) throw new Error(data.error || t('admin.model.testFailed'))
      setResults((prev) => ({ ...prev, [id]: data }))
      return data as TestResult
    } catch (err) {
      const message = err instanceof Error ? err.message : t('admin.model.testFailed')
      const failed: TestResult = {
        ok: false,
        status: 'error',
        latencyMs: 0,
        message,
        checkedAt: new Date().toISOString(),
      }
      setResults((prev) => ({
        ...prev,
        [id]: failed,
      }))
      return failed
    } finally {
      setTesting((prev) => prev.filter((item) => item !== id))
    }
  }

  async function testConnection(type: 'model' | 'service', key: string) {
    const data = await runConnectionTest(type, key)
    if (data.ok) toast.success(t('admin.model.connectionOk').replace('{key}', key))
    else toast.error(data.message || t('admin.model.connectionFailed').replace('{key}', key))
  }

  async function testAllConfigured() {
    if (!config) return
    const targets = [
      ...config.models.filter((model) => model.configured).map((model) => ({ type: 'model' as const, key: model.key })),
      ...config.services.filter((service) => service.status === 'configured').map((service) => ({ type: 'service' as const, key: service.key })),
    ]
    if (targets.length === 0) {
      toast.error(t('admin.model.noConfiguredTargets'))
      return
    }

    setBulkProgress({ done: 0, total: targets.length })
    let ok = 0
    for (const target of targets) {
      const result = await runConnectionTest(target.type, target.key)
      if (result.ok) ok += 1
      setBulkProgress((prev) => prev ? { ...prev, done: prev.done + 1 } : null)
    }
    setBulkProgress(null)
    toast.success(t('admin.model.testAllDone').replace('{ok}', String(ok)).replace('{total}', String(targets.length)))
  }

  function TestSummary({ id }: { id: string }) {
    const result = results[id]
    if (!result) return null
    const color =
      result.status === 'ok'
        ? 'text-green-700'
        : result.status === 'warning'
          ? 'text-amber-700'
          : 'text-red-700'
    return (
      <div className={`mt-2 max-w-xl text-xs ${color}`}>
        <span className="font-medium">{result.status.toUpperCase()}</span>
        <span className="text-[var(--color-fg-subtle)]"> · {result.latencyMs}ms{result.httpStatus ? ` · HTTP ${result.httpStatus}` : ''}</span>
        <div className="mt-0.5 break-words">{result.message}</div>
      </div>
    )
  }

  return (
    <div className="py-8 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Settings size={22} className="text-[var(--color-fg-muted)]" />
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-fg)]">{t('admin.model.title')}</h1>
            <p className="text-sm text-[var(--color-fg-muted)]">{t('admin.model.subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {config && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={testAllConfigured}
              disabled={testing.length > 0 || !!bulkProgress}
            >
              {bulkProgress ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
              {bulkProgress
                ? t('admin.model.testingAllProgress').replace('{done}', String(bulkProgress.done)).replace('{total}', String(bulkProgress.total))
                : t('admin.model.testAll')}
            </Button>
          )}
          <Badge variant="outline">{t('admin.common.adminOnly')}</Badge>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-8 text-sm text-[var(--color-fg-muted)]">{t('admin.common.loading')}</div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      ) : config && (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-medium">{t('admin.model.readOnlyTitle')}</div>
            <p className="mt-1">{t('admin.model.readOnlyReason')}</p>
          </div>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-fg)]">{t('admin.model.reviewModels')}</h2>
              <p className="text-sm text-[var(--color-fg-muted)]">{t('admin.model.reviewModelsDesc')}</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.model.colModel')}</TableHead>
                    <TableHead>{t('admin.model.colProvider')}</TableHead>
                    <TableHead>{t('admin.model.colBaseUrl')}</TableHead>
                    <TableHead>{t('admin.model.colEnv')}</TableHead>
                    <TableHead>{t('admin.model.colCredits')}</TableHead>
                    <TableHead>{t('admin.model.colStatus')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.models.map((model) => (
                    <TableRow key={model.key}>
                      <TableCell className="min-w-64">
                        <div className="font-medium text-[var(--color-fg)]">{model.displayName}</div>
                        <div className="mt-1 font-mono text-xs text-[var(--color-fg-muted)]">{model.key} · {model.modelId}</div>
                        <div className="mt-1 text-xs text-[var(--color-fg-subtle)]">temperature {model.temperature} · {modelNote(model.key)}</div>
                        <TestSummary id={`model:${model.key}`} />
                      </TableCell>
                      <TableCell><Badge variant="outline">{model.provider}</Badge></TableCell>
                      <TableCell className="max-w-56 break-all font-mono text-xs text-[var(--color-fg-muted)]">{model.baseUrl}</TableCell>
                      <TableCell>
                        <EnvList
                          env={model.env}
                          secretLabel={t('admin.model.secretChip')}
                          secretTitle={t('admin.model.secretLabel')}
                          nonSecretTitle={t('admin.model.nonSecretLabel')}
                        />
                      </TableCell>
                      <TableCell className="font-mono">{model.credits}</TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-2">
                          <StatusBadge configured={model.configured} labelConfigured={t('admin.model.configured')} labelMissing={t('admin.model.missing')} />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5"
                            onClick={() => testConnection('model', model.key)}
                            disabled={testing.length > 0 || !model.configured}
                          >
                            {testing.includes(`model:${model.key}`) ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
                            {t('admin.model.test')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-fg)]">{t('admin.model.services')}</h2>
              <p className="text-sm text-[var(--color-fg-muted)]">{t('admin.model.servicesDesc')}</p>
            </div>
            <div className="grid gap-3">
              {config.services.map((service) => (
                <div key={service.key} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-[var(--color-fg)]">{serviceName(service.key, service.name)}</h3>
                        <Badge variant="outline">{service.provider}</Badge>
                        <StatusBadge configured={service.status === 'configured'} labelConfigured={t('admin.model.configured')} labelMissing={t('admin.model.missing')} />
                      </div>
                      <div className="mt-2 max-w-3xl break-all font-mono text-xs text-[var(--color-fg-muted)]">{service.baseUrl}</div>
                      <p className="mt-2 text-sm text-[var(--color-fg-muted)]">{serviceNote(service.key, service.notes)}</p>
                      <TestSummary id={`service:${service.key}`} />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5"
                      onClick={() => testConnection('service', service.key)}
                      disabled={testing.length > 0 || service.status !== 'configured'}
                    >
                      {testing.includes(`service:${service.key}`) ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
                      {t('admin.model.test')}
                    </Button>
                  </div>
                  <div className="mt-3">
                    <EnvList
                      env={service.env}
                      secretLabel={t('admin.model.secretChip')}
                      secretTitle={t('admin.model.secretLabel')}
                      nonSecretTitle={t('admin.model.nonSecretLabel')}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
