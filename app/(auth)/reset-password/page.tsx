'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Zap } from 'lucide-react'
import Link from 'next/link'
import { useT } from '@/lib/i18n'

function ResetPasswordForm() {
  const t = useT()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { toast.error(t('auth.reset.passwordMismatch')); return }
    if (password.length < 8) { toast.error(t('auth.reset.passwordTooShort')); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('auth.reset.failed'))
      setDone(true)
      setTimeout(() => router.push('/login'), 2000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('auth.reset.failed'))
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground text-center">
        {t('auth.reset.invalidLink')}{' '}
        <Link href="/forgot-password" className="underline">{t('auth.reset.requestNew')}</Link>
      </p>
    )
  }

  return done ? (
    <div className="text-center space-y-2">
      <p className="text-sm font-medium text-green-700">{t('auth.reset.success')}</p>
      <p className="text-sm text-muted-foreground">{t('auth.reset.redirecting')}</p>
    </div>
  ) : (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">{t('auth.reset.newPassword')}</Label>
        <Input id="password" type="password" placeholder={t('auth.reset.passwordPh')}
          value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">{t('auth.reset.confirmPassword')}</Label>
        <Input id="confirm" type="password"
          value={confirm} onChange={e => setConfirm(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? t('auth.reset.processing') : t('auth.reset.btn')}
      </Button>
    </form>
  )
}

function ResetPasswordHeader() {
  const t = useT()
  return (
    <CardHeader>
      <CardTitle>{t('auth.reset.title')}</CardTitle>
      <CardDescription>{t('auth.reset.desc')}</CardDescription>
    </CardHeader>
  )
}

function ResetPasswordLoading() {
  const t = useT()
  return <p className="text-sm text-muted-foreground">{t('auth.reset.loading')}</p>
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-surface p-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--color-fg)] mb-4">
            <Zap className="text-white" size={24} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">HackAgent</h1>
        </div>
        <Card>
          <ResetPasswordHeader />
          <CardContent>
            <Suspense fallback={<ResetPasswordLoading />}>
              <ResetPasswordForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
