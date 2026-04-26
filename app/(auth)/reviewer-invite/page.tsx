'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface InviteInfo {
  event_name: string
  invite_email: string
  inviter_email: string
  already_accepted: boolean
}

function ReviewerInviteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    if (!token) { setError('无效的邀请链接'); setLoading(false); return }
    fetch(`/api/reviewer-invite?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setInfo(data)
      })
      .catch(() => setError('邀请链接无效或已过期'))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || password.length < 8) { toast.error('密码至少 8 位'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/reviewer-invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, name }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || '接受邀请失败'); return }
      if (data.requires_login) {
        // Existing account: do NOT auto-login. Send to login, then confirm.
        toast.info('该邮箱已注册，请登录后继续')
        const next = `/reviewer-invite/confirm?token=${encodeURIComponent(token)}`
        setTimeout(() => router.push(`/login?redirect=${encodeURIComponent(next)}`), 800)
        return
      }
      toast.success('注册成功，即将跳转到评审页')
      setTimeout(() => router.push(data.review_url || '/'), 1500)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin" size={24} />
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-red-500">{error}</p>
          <Button variant="link" className="mt-2" onClick={() => router.push('/login')}>前往登录</Button>
        </CardContent>
      </Card>
    </div>
  )

  if (info?.already_accepted) return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6 text-center space-y-3">
          <p className="text-sm">该邀请已接受，请直接登录后进入评审。</p>
          <Button onClick={() => router.push('/login')}>前往登录</Button>
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">接受评审邀请</CardTitle>
          <CardDescription>
            您被邀请参与 <strong>{info?.event_name}</strong> 的项目评审
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>邮箱</Label>
              <Input value={info?.invite_email ?? ''} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">姓名（可选）</Label>
              <Input
                id="name"
                placeholder="您的姓名"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">设置密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="至少 8 位"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <><Loader2 className="animate-spin mr-2" size={14} />注册中...</> : '注册并开始评审'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function ReviewerInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={24} /></div>}>
      <ReviewerInviteContent />
    </Suspense>
  )
}
