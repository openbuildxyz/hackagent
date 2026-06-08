'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, Settings, Wifi, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'

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

function StatusBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <Badge className="border-green-200 bg-green-50 text-green-700 hover:bg-green-50"><CheckCircle2 size={12} className="mr-1" />Configured</Badge>
  ) : (
    <Badge className="border-red-200 bg-red-50 text-red-700 hover:bg-red-50"><XCircle size={12} className="mr-1" />Missing</Badge>
  )
}

function EnvList({ env }: { env: EnvStatus[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {env.map((item) => (
        <span
          key={`${item.name}-${item.secret}`}
          title={item.secret ? 'Secret value hidden' : 'Non-secret setting'}
          className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${
            item.configured
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]'
          }`}
        >
          {item.name}{item.secret ? ' secret' : ''}
        </span>
      ))}
    </div>
  )
}

export default function AdminModelConfigPage() {
  const [config, setConfig] = useState<ConfigSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, TestResult>>({})

  useEffect(() => {
    fetch('/api/admin/model-config')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load model configuration')
        setConfig(data)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load model configuration'))
      .finally(() => setLoading(false))
  }, [])

  async function testConnection(type: 'model' | 'service', key: string) {
    const id = `${type}:${key}`
    setTesting(id)
    try {
      const res = await fetch('/api/admin/model-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, key }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && !data.status) throw new Error(data.error || 'Connectivity test failed')
      setResults((prev) => ({ ...prev, [id]: data }))
      if (data.ok) toast.success(`${key} connection OK`)
      else toast.error(data.message || `${key} connection failed`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connectivity test failed'
      setResults((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          status: 'error',
          latencyMs: 0,
          message,
          checkedAt: new Date().toISOString(),
        },
      }))
      toast.error(message)
    } finally {
      setTesting(null)
    }
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
            <h1 className="text-2xl font-bold text-[var(--color-fg)]">Model configuration</h1>
            <p className="text-sm text-[var(--color-fg-muted)]">Providers, model ids, base URLs, env var names, and configuration status.</p>
          </div>
        </div>
        <Badge variant="outline">Admin only</Badge>
      </div>

      {loading ? (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-8 text-sm text-[var(--color-fg-muted)]">Loading...</div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      ) : config && (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-medium">Read-only configuration</div>
            <p className="mt-1">{config.readOnlyReason}</p>
          </div>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-fg)]">Review models</h2>
              <p className="text-sm text-[var(--color-fg-muted)]">Runtime model functions used by project review scoring.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Base URL</TableHead>
                    <TableHead>Env</TableHead>
                    <TableHead>Credits</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.models.map((model) => (
                    <TableRow key={model.key}>
                      <TableCell className="min-w-64">
                        <div className="font-medium text-[var(--color-fg)]">{model.displayName}</div>
                        <div className="mt-1 font-mono text-xs text-[var(--color-fg-muted)]">{model.key} · {model.modelId}</div>
                        <div className="mt-1 text-xs text-[var(--color-fg-subtle)]">temperature {model.temperature} · {model.notes}</div>
                        <TestSummary id={`model:${model.key}`} />
                      </TableCell>
                      <TableCell><Badge variant="outline">{model.provider}</Badge></TableCell>
                      <TableCell className="max-w-56 break-all font-mono text-xs text-[var(--color-fg-muted)]">{model.baseUrl}</TableCell>
                      <TableCell><EnvList env={model.env} /></TableCell>
                      <TableCell className="font-mono">{model.credits}</TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-2">
                          <StatusBadge configured={model.configured} />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5"
                            onClick={() => testConnection('model', model.key)}
                            disabled={testing !== null || !model.configured}
                          >
                            {testing === `model:${model.key}` ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
                            Test
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
              <h2 className="text-lg font-semibold text-[var(--color-fg)]">App model and helper services</h2>
              <p className="text-sm text-[var(--color-fg-muted)]">Event generation, MiniMax code analysis, image generation, GitHub/Web3/Sonar helpers.</p>
            </div>
            <div className="grid gap-3">
              {config.services.map((service) => (
                <div key={service.key} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-[var(--color-fg)]">{service.name}</h3>
                        <Badge variant="outline">{service.provider}</Badge>
                        <StatusBadge configured={service.status === 'configured'} />
                      </div>
                      <div className="mt-2 max-w-3xl break-all font-mono text-xs text-[var(--color-fg-muted)]">{service.baseUrl}</div>
                      <p className="mt-2 text-sm text-[var(--color-fg-muted)]">{service.notes}</p>
                      <TestSummary id={`service:${service.key}`} />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5"
                      onClick={() => testConnection('service', service.key)}
                      disabled={testing !== null || service.status !== 'configured'}
                    >
                      {testing === `service:${service.key}` ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
                      Test
                    </Button>
                  </div>
                  <div className="mt-3"><EnvList env={service.env} /></div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
