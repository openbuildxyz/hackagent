'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Zap, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useT } from '@/lib/i18n'

export default function ForgotPasswordPage() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || t('auth.forgot.sendFailed'))
      setSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('auth.forgot.sendFailed'))
    } finally {
      setLoading(false)
    }
  }

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
          <CardHeader>
            <CardTitle>{t('auth.forgot.title')}</CardTitle>
            <CardDescription>
              {sent ? t('auth.forgot.sentTitle') : t('auth.forgot.desc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t('auth.forgot.sentDesc')}
                </p>
                <p className="text-sm text-muted-foreground">{t('auth.forgot.noEmail')}</p>
                <Link href="/login">
                  <Button variant="outline" className="w-full gap-2">
                    <ArrowLeft size={14} />
                    {t('auth.backToLogin')}
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.forgot.emailLabel')}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('auth.emailPh')}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('auth.forgot.sending') : t('auth.forgot.send')}
                </Button>
                <Link href="/login">
                  <Button variant="ghost" className="w-full gap-2 text-muted-foreground">
                    <ArrowLeft size={14} />
                    {t('auth.backToLogin')}
                  </Button>
                </Link>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
