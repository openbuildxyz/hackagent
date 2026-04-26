import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSessionUser } from '@/lib/session'

// OPE-126: Force dynamic rendering — cookies() in SSR must read the live request,
// not a cached/static shell. Without this, Vercel cold-start ISR can return a
// pre-rendered page with no session → blank page on direct URL access.
export const dynamic = 'force-dynamic'
import { createServiceClient } from '@/lib/supabase-server'
import { getServerLocale } from '@/lib/i18n-server'
import { LocaleProvider } from '@/lib/i18n'
import SidebarContent from './SidebarContent'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser()
  if (!session) {
    const h = await headers()
    const pathname = h.get('x-invoke-path') || h.get('x-pathname') || ''
    const params = new URLSearchParams({ msg: 'login_required' })
    if (pathname && pathname.startsWith('/')) params.set('redirect', pathname)
    redirect(`/login?${params.toString()}`)
  }

  const db = createServiceClient()
  const { data: user } = await db
    .from('users')
    .select('email, credits, role')
    .eq('id', session.userId)
    .single()

  const role: string[] = Array.isArray(user?.role) ? user.role : (user?.role ? [user.role as string] : ['viewer'])
  const locale = await getServerLocale()

  return (
    <LocaleProvider initial={locale}>
      <div className="flex h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
        <SidebarContent email={user?.email ?? ''} credits={user?.credits ?? 0} role={role} />
        <main className="flex-1 overflow-auto flex flex-col">
          <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">{children}</div>
          <footer className="border-t border-[var(--color-border)] px-6 lg:px-8 py-4 text-xs text-[var(--color-fg-subtle)] flex items-center justify-between">
            <span>© 2026 HackAgent · Powered by OpenBuild</span>
            <span>AI-driven Hackathon Review Platform</span>
          </footer>
        </main>
      </div>
    </LocaleProvider>
  )
}
