'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Zap, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

function VerifyContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('无效的验证链接')
      return
    }

    fetch(`/api/auth/verify?token=${token}`)
      .then(res => {
        if (res.redirected && res.url.includes('verified=1')) {
          setStatus('success')
          setMessage('邮箱验证成功！即将跳转登录...')
          // 读取注册时保存的 redirect
          const savedRedirect = localStorage.getItem('hackagent-post-verify-redirect')
          localStorage.removeItem('hackagent-post-verify-redirect')
          setTimeout(() => {
            const loginUrl = savedRedirect
              ? `/login?verified=1&redirect=${encodeURIComponent(savedRedirect)}`
              : '/login?verified=1'
            window.location.href = loginUrl
          }, 1500)
        } else if (res.redirected && res.url.includes('error=')) {
          const url = new URL(res.url)
          const err = url.searchParams.get('error')
          setStatus('error')
          setMessage(err === 'token_expired' ? '验证链接已过期，请重新注册' : '验证链接无效')
        } else {
          setStatus('success')
          setMessage('邮箱验证成功！您可以立即登录。')
        }
      })
      .catch(() => {
        setStatus('error')
        setMessage('验证失败，请重试')
      })
  }, [token])

  return (
    <>
      {status === 'loading' && (
        <>
          <Loader2 className="animate-spin mx-auto mb-4 text-fg-subtle" size={32} />
          <p className="text-muted-foreground">正在验证邮箱...</p>
        </>
      )}

      {status === 'success' && (
        <>
          <CheckCircle className="mx-auto mb-4 text-green-500" size={40} />
          <h1 className="text-xl font-bold mb-2">验证成功</h1>
          <p className="text-muted-foreground mb-6">{message}</p>
          <Loader2 className="animate-spin mx-auto text-fg-subtle" size={20} />
        </>
      )}

      {status === 'error' && (
        <>
          <XCircle className="mx-auto mb-4 text-red-500" size={40} />
          <h1 className="text-xl font-bold mb-2">验证失败</h1>
          <p className="text-muted-foreground mb-6">{message}</p>
          <Link href="/login">
            <Button variant="outline">返回登录</Button>
          </Link>
        </>
      )}
    </>
  )
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--color-fg)] mb-6">
          <Zap className="text-white" size={24} />
        </div>
        <Suspense fallback={<Loader2 className="animate-spin mx-auto text-fg-subtle" size={32} />}>
          <VerifyContent />
        </Suspense>
      </div>
    </div>
  )
}
