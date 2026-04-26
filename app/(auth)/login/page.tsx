'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Zap } from 'lucide-react'
import { useT } from '@/lib/i18n'
import type { TranslationKey } from '@/lib/i18n'

function LoginForm() {
  const t = useT()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<'login' | 'register'>(
    searchParams.get('mode') === 'register' ? 'register' : 'login'
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)

  const verified = searchParams.get('verified') === '1'
  const error = searchParams.get('error')
  const msg = searchParams.get('msg')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (mode === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        const data = await res.json()
        if (!res.ok) {
          // Translate server error codes (e.g. INVALID_CREDENTIALS) via i18n
          const key = data.error ? `auth.err.${data.error}` : ''
          const translated = key ? t(key as TranslationKey) : ''
          const msg = (translated && translated !== key) ? translated : (data.error || t('auth.err.loginFailed'))
          throw new Error(msg)
        }
        const redirectTo = searchParams.get('redirect') || '/dashboard'
        window.location.href = redirectTo
      } else {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, invite_code: inviteCode }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || t('auth.err.registerFailed'))
        const redirectTo = searchParams.get('redirect')
        if (redirectTo) localStorage.setItem('hackagent-post-verify-redirect', redirectTo)
        toast.success(data.message || t('auth.register.verifyEmailSent'))
        setMode('login')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('auth.err.opFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--color-fg)] mb-4">
          <Zap className="text-white" size={24} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">HackAgent</h1>
        <p className="text-muted-foreground mt-2 text-sm">{t('auth.appSubtitle')}</p>
      </div>

      {verified && (
        <div className="mb-4 p-3 rounded-md bg-green-50 border border-green-200 text-green-800 text-sm text-center">
          {t('auth.verifiedOk')}
        </div>
      )}
      {error === 'invalid_token' && (
        <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm text-center">
          {t('auth.err.invalidToken')}
        </div>
      )}
      {error === 'token_expired' && (
        <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm text-center">
          {t('auth.err.tokenExpired')}
        </div>
      )}
      {msg === 'login_required' && !verified && error !== 'invalid_token' && error !== 'token_expired' && (
        <div className="mb-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm text-center">
          {t('auth.msg.loginRequired')}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{mode === 'login' ? t('auth.login.title') : t('auth.register.title')}</CardTitle>
          <CardDescription>
            {mode === 'login' ? t('auth.login.desc') : t('auth.register.desc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('auth.emailPh')}
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder={mode === 'register' ? t('auth.passwordPh.register') : t('auth.passwordPh.login')}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 8 : 6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="invite-code">{t('auth.inviteCode')}</Label>
                <Input
                  id="invite-code"
                  type="text"
                  placeholder={t('auth.inviteCodePh')}
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value)}
                  required
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">{t('auth.inviteCodeHint')}</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('auth.processing') : mode === 'login' ? t('auth.login.btn') : t('auth.register.btn')}
            </Button>

            {mode === 'login' && (
              <div className="text-center">
                <a href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4">
                  {t('auth.forgotLink')}
                </a>
              </div>
            )}
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>
                {t('auth.noAccount')}{' '}
                <button
                  type="button"
                  className="text-foreground font-medium underline underline-offset-4 hover:no-underline"
                  onClick={() => setMode('register')}
                >
                  {t('auth.goRegister')}
                </button>
              </>
            ) : (
              <>
                {t('auth.haveAccount')}{' '}
                <button
                  type="button"
                  className="text-foreground font-medium underline underline-offset-4 hover:no-underline"
                  onClick={() => setMode('login')}
                >
                  {t('auth.goLogin')}
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center bg-surface px-4 py-12">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
