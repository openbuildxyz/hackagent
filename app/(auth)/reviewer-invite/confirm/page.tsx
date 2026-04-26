'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

function ConfirmContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [state, setState] = useState<'loading' | 'error' | 'ok'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!token) {
        if (!cancelled) { setState('error'); setMessage('无效的邀请链接') }
        return
      }
      try {
        const res = await fetch('/api/reviewer-invite/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()
        if (cancelled) return
        if (res.status === 401) {
          const next = `/reviewer-invite/confirm?token=${encodeURIComponent(token)}`
          router.push(`/login?redirect=${encodeURIComponent(next)}`)
          return
        }
        if (!res.ok) {
          setState('error')
          setMessage(data.error || '确认失败')
          return
        }
        setState('ok')
        toast.success('已确认评审邀请')
        setTimeout(() => router.push(data.review_url || '/'), 800)
      } catch {
        if (!cancelled) { setState('error'); setMessage('网络错误') }
      }
    })()
    return () => { cancelled = true }
  }, [token, router])

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" size={24} />
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-lg">确认失败</CardTitle>
            <CardDescription>{message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="link" onClick={() => router.push('/events')}>返回</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin" size={24} />
    </div>
  )
}

export default function ReviewerInviteConfirmPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" size={24} /></div>}>
      <ConfirmContent />
    </Suspense>
  )
}
