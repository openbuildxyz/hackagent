'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocale, useT } from '@/lib/i18n'
import PublicNavbar from '@/components/PublicNavbar'

export default function ApplyToHostPage() {
  const [locale] = useLocale()
  const t = useT()
  const [form, setForm] = useState({
    name: '',
    email: '',
    org: '',
    event_brief: '',
    expected_size: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof form, string>>>({})
  const [done, setDone] = useState(false)

  useEffect(() => {
    document.title = t('host.page.title')
  }, [t, locale])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }))
    if (error) setError(null)
    if (fieldErrors[k]) setFieldErrors(prev => ({ ...prev, [k]: undefined }))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const fe: Partial<Record<keyof typeof form, string>> = {}
    if (!form.name.trim()) fe.name = t('host.err.field.name')
    if (!form.email.trim()) fe.email = t('host.err.field.email')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) fe.email = t('host.err.email')
    if (!form.org.trim()) fe.org = t('host.err.field.org')
    if (!form.event_brief.trim()) fe.event_brief = t('host.err.field.brief')
    if (!form.expected_size.trim()) fe.expected_size = t('host.err.field.size')
    if (Object.keys(fe).length > 0) {
      setFieldErrors(fe)
      return
    }
    setFieldErrors({})

    setSubmitting(true)
    try {
      const res = await fetch('/api/host-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok && res.status !== 202) {
        let serverMsg = ''
        try {
          const data = await res.json()
          serverMsg = data?.error || data?.message || ''
        } catch {}
        setError(serverMsg ? `${t('host.err.failed')} (${res.status}: ${serverMsg})` : `${t('host.err.failed')} (${res.status})`)
        setSubmitting(false)
        return
      }
      setDone(true)
    } catch {
      setError(t('host.err.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen font-sans flex items-center justify-center px-6" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-fg)' }}>
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-[var(--color-success)]/15 flex items-center justify-center">
            <CheckCircle2 className="text-[var(--color-success)]" size={30} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">{t('host.success.title')}</h1>
          <p className="text-[var(--color-fg-muted)] text-sm mb-8">{t('host.success.desc')}</p>
          <Link href="/" className="text-sm text-[var(--color-accent)] hover:opacity-80">
            {t('host.success.back')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-fg)' }}>
      <PublicNavbar />

      <main className="max-w-3xl mx-auto px-6 lg:px-8 py-14">
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">{t('host.page.title')}</h1>
          <p className="text-[var(--color-fg-muted)] text-[15px] leading-relaxed max-w-xl">
            {t('host.page.subtitle')}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 max-w-xl" noValidate>
          <Field label={t('host.field.name')} error={fieldErrors.name}>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              className={`input-base ${fieldErrors.name ? 'input-invalid' : ''}`}
              autoComplete="name"
              aria-invalid={!!fieldErrors.name}
            />
          </Field>

          <Field label={t('host.field.email')} error={fieldErrors.email}>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              className={`input-base ${fieldErrors.email ? 'input-invalid' : ''}`}
              autoComplete="email"
              aria-invalid={!!fieldErrors.email}
            />
          </Field>

          <Field label={t('host.field.org')} error={fieldErrors.org}>
            <input
              type="text"
              value={form.org}
              onChange={set('org')}
              className={`input-base ${fieldErrors.org ? 'input-invalid' : ''}`}
              autoComplete="organization"
              aria-invalid={!!fieldErrors.org}
            />
          </Field>

          <Field label={t('host.field.brief')} error={fieldErrors.event_brief}>
            <textarea
              value={form.event_brief}
              onChange={set('event_brief')}
              rows={5}
              placeholder={t('host.field.briefPh')}
              className={`input-base resize-y ${fieldErrors.event_brief ? 'input-invalid' : ''}`}
              aria-invalid={!!fieldErrors.event_brief}
            />
          </Field>

          <Field label={t('host.field.size')} error={fieldErrors.expected_size}>
            <input
              type="text"
              value={form.expected_size}
              onChange={set('expected_size')}
              placeholder={t('host.field.sizePh')}
              className={`input-base ${fieldErrors.expected_size ? 'input-invalid' : ''}`}
              aria-invalid={!!fieldErrors.expected_size}
            />
          </Field>

          {error && (
            <p className="text-sm text-[var(--color-danger)]">{error}</p>
          )}

          <div className="pt-2">
            <Button type="submit" size="lg" disabled={submitting} className="rounded-md px-6 gap-2 h-11">
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? t('host.submitting') : t('host.submit')}
            </Button>
          </div>
        </form>
      </main>

      <style jsx>{`
        :global(.input-base) {
          width: 100%;
          padding: 0.625rem 0.875rem;
          background-color: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 0.5rem;
          color: var(--color-fg);
          font-size: 14px;
          line-height: 1.5;
          transition: border-color 120ms, background-color 120ms;
        }
        :global(.input-base:focus) {
          outline: none;
          border-color: var(--color-accent);
          background-color: var(--color-bg);
        }
        :global(.input-base::placeholder) {
          color: var(--color-fg-subtle);
        }
        :global(.input-invalid) {
          border-color: var(--color-danger) !important;
        }
        :global(.input-invalid:focus) {
          border-color: var(--color-danger) !important;
        }
      `}</style>
    </div>
  )
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-[var(--color-fg)] mb-1.5">{label}</span>
      {children}
      {error && (
        <span className="block mt-1.5 text-[12px] text-[var(--color-danger)]">{error}</span>
      )}
    </label>
  )
}
