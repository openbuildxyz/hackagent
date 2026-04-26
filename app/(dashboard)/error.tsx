'use client'

// OPE-76: Dashboard subtree error boundary.
//
// Before this existed, a hydration error (e.g. React #418 from SSR/CSR text
// divergence) or any uncaught render error in a dashboard page would blank the
// entire content area, leaving only the layout's footer visible. That showed
// up as "white screen on direct URL" but worked via SPA nav because SPA nav
// skips SSR entirely.
//
// This boundary catches the error, shows a readable retry UI, and keeps the
// sidebar + layout chrome intact so the user can navigate away.
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard] render error', error)
  }, [error])

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-8">
      <div className="max-w-md w-full rounded-xl border border-token bg-surface p-6 text-center space-y-4">
        <div className="inline-flex w-10 h-10 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertTriangle size={18} />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-fg">页面加载失败 / Page failed to load</h2>
          <p className="text-sm text-fg-muted">
            请重试。如果问题持续存在，请联系管理员。
            <br />
            Please retry. If the problem persists, contact the administrator.
          </p>
        </div>
        {error?.digest && (
          <p className="text-[11px] font-mono text-fg-subtle">digest: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" onClick={() => reset()} className="gap-1.5">
            <RefreshCw size={13} />
            重试 / Retry
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { window.location.href = '/dashboard' }}
          >
            返回 Dashboard / Back
          </Button>
        </div>
      </div>
    </div>
  )
}
