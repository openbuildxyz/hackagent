'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Sun, Moon, ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT, useLocale, type Locale } from '@/lib/i18n'

export default function PublicNavbar() {
  const t = useT()
  const [locale, setLocale] = useLocale()
  const [loggedIn, setLoggedIn] = useState(false)
  const [dark, setDark] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => setLoggedIn(!!data?.loggedIn))
      .catch(() => {})
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    if (next) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch {}
  }

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        backgroundColor: 'var(--color-bg)',
        borderColor: 'var(--color-border)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-sm"
            style={{ backgroundColor: 'var(--color-accent)' }}
          >H</span>
          <span className="font-bold text-[15px] tracking-tight" style={{ color: 'var(--color-fg)' }}>
            HackAgent
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-mono font-medium"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-fg-subtle)',
              border: '1px solid var(--color-border)',
            }}
          >BETA</span>
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-1">
          {[
            { href: '/events/public', label: t('nav.eventSquare') },
            { href: '/#how', label: t('nav.howItWorks') },
            { href: '/api/v1/skill.md', label: 'Skill', external: true, accent: true },
            { href: locale === 'en' ? '/docs.en.html' : '/docs.html', label: locale === 'zh' ? '文档' : 'Docs', external: true },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              prefetch={item.external ? false : undefined}
              onClick={
                item.href === '/#how'
                  ? (e) => {
                      if (pathname !== '/') {
                        e.preventDefault()
                        window.location.href = '/#how'
                      }
                    }
                  : undefined
              }
              className="px-3 py-1.5 rounded-md text-sm transition-colors"
              style={{ color: item.accent ? 'var(--color-accent)' : 'var(--color-fg-muted)' }}
              onMouseEnter={e => {
                if (!item.accent) (e.currentTarget as HTMLElement).style.color = 'var(--color-fg)'
                ;(e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-surface)'
              }}
              onMouseLeave={e => {
                if (!item.accent) (e.currentTarget as HTMLElement).style.color = 'var(--color-fg-muted)'
                ;(e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Locale toggle */}
          <div
            className="flex items-center rounded-md overflow-hidden text-xs"
            style={{ border: '1px solid var(--color-border)' }}
          >
            {(['zh', 'en'] as Locale[]).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className="px-2.5 py-1.5 transition-colors"
                style={
                  locale === l
                    ? { backgroundColor: 'var(--color-fg)', color: 'var(--color-bg)' }
                    : { color: 'var(--color-fg-muted)' }
                }
              >
                {l === 'zh' ? '中' : 'EN'}
              </button>
            ))}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
            style={{
              border: '1px solid var(--color-border)',
              color: 'var(--color-fg)',
              backgroundColor: 'var(--color-surface)',
            }}
          >
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          {/* Auth */}
          {loggedIn ? (
            <Link href="/events">
              <Button size="sm" className="rounded-md gap-1 px-3 sm:px-4 h-8">
                {locale === 'zh' ? '后台' : 'Dashboard'} <ArrowUpRight size={12} />
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden sm:inline-block">
                <Button variant="ghost" size="sm" className="h-8">
                  {t('pub.login')}
                </Button>
              </Link>
              <Link href="/login">
                <Button size="sm" className="rounded-md px-3 sm:px-4 h-8">
                  {locale === 'zh' ? '开始使用' : 'Get Started'}
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
