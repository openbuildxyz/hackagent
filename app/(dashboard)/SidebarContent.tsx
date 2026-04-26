'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Plus, Coins, CreditCard, ClipboardList, Users, KeyRound, Bot, Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'
import LogoutButton from './LogoutButton'
import ChangePasswordButton from './ChangePasswordButton'
import { useLocale, useT } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
        active
          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
          : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]'
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-[var(--color-accent)]" />
      )}
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </Link>
  )
}

function SidebarThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])
  const toggle = () => {
    const next = !dark
    setDark(next)
    if (next) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch {}
  }
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="w-7 h-7 rounded-md border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] flex items-center justify-center transition-colors"
    >
      {dark ? <Sun size={13} /> : <Moon size={13} />}
    </button>
  )
}

export default function SidebarContent({ email, credits, role = ['viewer'] }: { email: string; credits: number; role?: string[] }) {
  const t = useT()
  const [locale, setLocale] = useLocale()
  const pathname = usePathname() || ''

  const isActive = (path: string, exact = false) => exact ? pathname === path : pathname === path || pathname.startsWith(path + '/')

  return (
    <aside
      className="w-56 border-r flex flex-col shrink-0 h-screen overflow-hidden"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="px-4 h-14 flex items-center border-b border-[var(--color-border)]">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-[var(--color-accent)] flex items-center justify-center text-white font-black text-xs">H</span>
          <span className="font-bold text-[15px] tracking-tight text-[var(--color-fg)]">HackAgent</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {(role.includes('admin') || role.includes('organizer')) && (
          <>
            <NavItem href="/dashboard" active={isActive('/dashboard', true) || pathname === '/events' || pathname.startsWith('/events/')} icon={<LayoutDashboard size={15} />} label={t('nav.myEvents')} />
            <NavItem href="/events/new" active={isActive('/events/new')} icon={<Plus size={15} />} label={t('nav.newEvent')} />
          </>
        )}
        {role.includes('reviewer') && (
          <NavItem href="/my-reviews" active={isActive('/my-reviews')} icon={<ClipboardList size={15} />} label={t('nav.myReviews')} />
        )}
        {role.includes('admin') && (
          <NavItem href="/admin/users" active={isActive('/admin/users')} icon={<Users size={15} />} label={t('nav.users')} />
        )}
        {(role.includes('admin') || role.includes('organizer')) && (
          <>
            <NavItem href="/api-keys" active={isActive('/api-keys')} icon={<KeyRound size={15} />} label={t('nav.apiKeys')} />
            <NavItem href="/my-agents" active={isActive('/my-agents')} icon={<Bot size={15} />} label={t('nav.myAgents')} />
          </>
        )}
      </nav>

      <div className="p-3 border-t border-[var(--color-border)] space-y-2">
        <Link
          href="/credits"
          className="flex items-center justify-between px-3 py-2 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-bg)] border border-[var(--color-border)] transition-colors group"
        >
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-fg-subtle)] mb-0.5 uppercase tracking-wider font-mono">
              <Coins size={11} />
              {t('nav.credits')}
            </div>
            <div className="text-sm font-semibold text-[var(--color-fg)] font-mono">{credits}</div>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[var(--color-fg-subtle)] group-hover:text-[var(--color-accent)] transition-colors">
            <CreditCard size={11} />
            {t('nav.recharge')}
          </div>
        </Link>
        <div className="px-3">
          <p className="text-[11px] text-[var(--color-fg-subtle)] truncate">{email}</p>
        </div>
        <LogoutButton />
        <ChangePasswordButton />

        <div className="flex items-center justify-between px-3 pt-1">
          <div className="flex items-center gap-1">
            {(['zh', 'en'] as Locale[]).map(l => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`text-[11px] px-2 py-0.5 rounded transition-colors ${locale === l ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]'}`}
              >
                {l === 'zh' ? '中' : 'EN'}
              </button>
            ))}
          </div>
          <SidebarThemeToggle />
        </div>
      </div>
    </aside>
  )
}
