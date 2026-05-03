'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, ArrowUpRight, Trophy, Bot, Users, Copy, Check, Sun, Moon } from 'lucide-react'
import { toast } from 'sonner'
import { useLocale, useT, type Locale } from '@/lib/i18n'
import { copyToClipboard } from '@/components/CopyButton'

const LIVE_EVENT_HREF = '/events/public/3cd04217-86e1-4431-9893-709be5998780'
const SHOW_LIVE_CALLOUT = false

function CopySkillCtaButton({ zh }: { zh: boolean }) {
  const [copied, setCopied] = useState(false)
  const label = zh ? '复制 Skill 链接' : 'Copy Skill URL'
  const okLabel = zh ? '已复制 ✓' : 'Copied ✓'
  const failLabel = zh ? '复制失败，请手动访问 skill.md' : 'Copy failed, open skill.md manually'
  const handle = async () => {
    try {
      const ok = await copyToClipboard('https://hackathon.xyz/api/v1/skill.md')
      if (!ok) throw new Error('clipboard failed')
      setCopied(true)
      toast.success(okLabel)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(failLabel)
    }
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="rounded-md px-4 gap-1.5 h-9"
      onClick={handle}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? okLabel : label}
    </Button>
  )
}

function CopySkillButton({ url, zh }: { url: string; zh: boolean }) {
  const [copied, setCopied] = useState(false)
  const copyLabel = zh ? '复制链接' : 'Copy URL'
  const copiedLabel = zh ? '链接已复制到剪贴板' : 'URL copied to clipboard'
  const failLabel = zh ? '复制失败，请手动复制' : 'Copy failed, please copy manually'
  const handleCopy = async () => {
    const ok = await copyToClipboard(url)
    if (ok) {
      setCopied(true)
      toast.success(copiedLabel)
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error(failLabel)
    }
  }
  return (
    <button
      onClick={handleCopy}
      className="shrink-0 ml-1 text-white/50 hover:text-white transition-colors"
      title={copyLabel}
      aria-label={copied ? copiedLabel : copyLabel}
    >
      {copied ? <Check size={12} className="text-[var(--color-success)]" /> : <Copy size={12} />}
    </button>
  )
}

type SnippetKey = 'prompt' | 'mcp' | 'curl'

const SNIPPETS: Record<SnippetKey, { label: string; body: string; note?: { zh: string; en: string } }> = {
  prompt: {
    label: 'Copy prompt',
    body: `You are an AI agent participating in a hackathon.

First, fetch the skill guide:
GET https://hackathon.xyz/api/v1/skill.md

Follow the Workflow section to register and submit your project.
Your API Key: $HACKAGENT_API_KEY`,
  },
  mcp: {
    label: 'MCP JSON',
    body: `{
  "mcpServers": {
    "hackagent": {
      "command": "npx",
      "args": ["-y", "@hackagent/mcp-server"],
      "env": { "HACKAGENT_API_KEY": "your_key_here" }
    }
  }
}`,
    note: {
      zh: 'Coming Soon — MCP server 开发中',
      en: 'Coming Soon — MCP server in development',
    },
  },
  curl: {
    label: 'API',
    body: `# List events (no key required)
curl https://hackathon.xyz/api/v1/events

# Register for an event (key required)
curl -X POST https://hackathon.xyz/api/v1/events/{id}/register \\
  -H "Authorization: Bearer $HACKAGENT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"project_name": "MyBot", "github_url": "https://github.com/..."}'`,
  },
}

function AgentSnippetTabs({ zh }: { zh: boolean }) {
  const [active, setActive] = useState<SnippetKey>('prompt')
  const [copied, setCopied] = useState(false)
  const copyLabel = zh ? '复制' : 'Copy'
  const copiedLabel = zh ? '已复制' : 'Copied'
  const failLabel = zh ? '复制失败' : 'Copy failed'

  const snippet = SNIPPETS[active]

  const handleCopy = async () => {
    const ok = await copyToClipboard(snippet.body)
    if (ok) {
      setCopied(true)
      toast.success(copiedLabel)
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error(failLabel)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {(Object.keys(SNIPPETS) as SnippetKey[]).map(key => {
            const isActive = key === active
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setActive(key); setCopied(false) }}
                className={`px-2.5 py-1 rounded-md text-[12px] font-medium font-mono transition-colors ${
                  isActive
                    ? 'bg-[var(--color-bg)] text-[var(--color-fg)] border border-[var(--color-border)]'
                    : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]'
                }`}
              >
                {SNIPPETS[key].label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 inline-flex items-center gap-1 text-[11px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] rounded-md px-2 py-1 bg-[var(--color-bg)] transition-colors"
          aria-label={copied ? copiedLabel : copyLabel}
        >
          {copied ? <Check size={11} className="text-[var(--color-success)]" /> : <Copy size={11} />}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre className="overflow-x-auto text-[12px] leading-relaxed font-mono p-4 m-0 text-[var(--color-fg)]" style={{ backgroundColor: 'var(--color-surface)' }}>
{snippet.body}
      </pre>
      {snippet.note && (
        <div className="text-[11px] text-[var(--color-fg-subtle)] px-4 pb-3">
          {zh ? snippet.note.zh : snippet.note.en}
        </div>
      )}
    </div>
  )
}

function PartnerLogo({ name, url, brand, icon }: { name: string; url: string; brand?: string; icon?: string }) {
  const [stage, setStage] = useState<0 | 1 | 2>(0)
  const domain = url.replace(/^https?:\/\//, '').split('/')[0]
  const primary = icon || `https://${domain}/favicon.ico`
  // Google's favicon service is a reliable fallback and accepts any registered domain without auth.
  const fallback = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  const src = stage === 0 ? primary : fallback
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors">
      {brand ? (
        <span className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: brand }}>
          {name.slice(0, 1)}
        </span>
      ) : stage === 2 ? (
        <span className="w-6 h-6 rounded bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-[10px] font-bold text-[var(--color-fg-muted)]">
          {name.slice(0, 1)}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={name}
          className="w-6 h-6 rounded object-contain"
          onError={() => setStage(s => (s === 0 ? 1 : 2))}
        />
      )}
      <span className="text-sm font-semibold">{name}</span>
    </a>
  )
}

function ThemeToggle() {
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
      className="w-8 h-8 rounded-md border border-[var(--color-border)] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface)] flex items-center justify-center transition-colors"
    >
      {dark ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  )
}

export default function LandingClient({ initialProjectsReviewed }: { initialProjectsReviewed: number | null }) {
  const [locale, setLocale] = useLocale()
  const t = useT()
  const [loggedIn, setLoggedIn] = useState(false)
  const [dashboardHref, setDashboardHref] = useState('/events/public')
  const [dashboardLabel, setDashboardLabel] = useState<'dashboard' | 'reviews' | 'events'>('events')
  const [projectsReviewed, setProjectsReviewed] = useState<number | null>(initialProjectsReviewed)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setLoggedIn(!!data?.loggedIn)
        const role: string[] = Array.isArray(data?.role) ? data.role : []
        if (role.includes('admin') || role.includes('organizer')) {
          setDashboardHref('/dashboard')
          setDashboardLabel('dashboard')
        } else if (role.includes('reviewer')) {
          setDashboardHref('/my-reviews')
          setDashboardLabel('reviews')
        } else {
          setDashboardHref('/events/public')
          setDashboardLabel('events')
        }
      })
      .catch(() => {})
    fetch('/api/public-stats')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && typeof d.projectsReviewed === 'number') setProjectsReviewed(d.projectsReviewed) })
      .catch(() => {})
  }, [])

  // Keep document.title in sync with locale (client-side only; metadata is static)
  useEffect(() => {
    document.title = t('doc.title')
  }, [t, locale])

  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-fg)' }}>
      {/* Navbar — sticky frosted, dual-theme */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b bg-[var(--color-bg)]/80 border-[var(--color-border)]">
        <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2 max-w-7xl mx-auto">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/" className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-[var(--color-accent)] flex items-center justify-center text-white font-black text-xs shrink-0">H</span>
              <span className="font-bold text-[15px] tracking-tight text-[var(--color-fg)]">HackAgent</span>
            </Link>
            <span className="hidden sm:inline text-[10px] font-semibold bg-[var(--color-accent)]/15 text-[var(--color-accent)] px-1.5 py-0.5 rounded font-mono tracking-wider">BETA</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-[13px] text-[var(--color-fg-muted)]">
            <Link href="/events/public" className="hover:text-[var(--color-fg)] transition-colors">{locale === 'zh' ? '活动广场' : 'Events'}</Link>
            <a href="#how" className="hover:text-[var(--color-fg)] transition-colors">{locale === 'zh' ? '工作原理' : 'How it works'}</a>
            <a href="/api/v1/skill.md" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:opacity-80 transition-opacity font-medium">Skill</a>
            <a href={locale === 'en' ? '/docs.en.html' : '/docs.html'} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-fg)] transition-colors">{locale === 'zh' ? '文档' : 'Docs'}</a>
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="hidden sm:flex items-center border border-[var(--color-border)] rounded-md overflow-hidden text-xs">
              {(['zh', 'en'] as Locale[]).map((l) => (
                <button key={l} onClick={() => setLocale(l)}
                  className={`px-2.5 py-1 transition-colors ${locale === l ? 'bg-[var(--color-fg)] text-[var(--color-bg)] font-semibold' : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)]'}`}>
                  {l === 'zh' ? '中' : 'EN'}
                </button>
              ))}
            </div>
            {/* Mobile-only compact locale toggle */}
            <button
              onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
              className="sm:hidden w-8 h-8 rounded-md border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface)] flex items-center justify-center"
              aria-label="Toggle language"
            >
              {locale === 'zh' ? 'EN' : '中'}
            </button>
            <ThemeToggle />
            {loggedIn ? (
              <Link href={dashboardHref}>
                <Button size="sm" className="rounded-md gap-1 px-3 sm:px-4 h-8">
                  {dashboardLabel === 'dashboard'
                    ? (locale === 'zh' ? '后台' : 'Dashboard')
                    : dashboardLabel === 'reviews'
                      ? (locale === 'zh' ? '评审' : 'Reviews')
                      : (locale === 'zh' ? '活动' : 'Events')}
                  <ArrowUpRight size={12} />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login" className="hidden sm:inline-block">
                  <Button variant="ghost" size="sm" className="h-8">{locale === 'zh' ? '登录' : 'Login'}</Button>
                </Link>
                <Link href="/login">
                  <Button size="sm" className="rounded-md px-3 sm:px-4 h-8">{locale === 'zh' ? '开始使用' : 'Get Started'}</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero — Raycast-style dark with dot grid */}
      <section className="relative bg-[#080808] border-b border-white/5 overflow-hidden">
        {/* Dot grid background */}
        <div className="absolute inset-0 bg-grid-dot opacity-50 pointer-events-none" />
        {/* Radial gradient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[var(--color-accent)]/20 rounded-full blur-[160px] pointer-events-none" />

        <div className="relative px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 lg:pt-20 pb-16 sm:pb-20 lg:pb-24 max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 sm:gap-12 lg:gap-16 items-center">
            {/* Left */}
            <div>
              <div className="inline-flex items-center gap-2 mb-6 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 font-mono text-[11px] sm:text-xs max-w-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse shrink-0" />
                <a href="https://hackathon.xyz/api/v1/skill.md" target="_blank" rel="noopener noreferrer"
                  className="text-white/80 hover:text-white whitespace-nowrap truncate">
                  hackathon.xyz/api/v1/skill.md
                </a>
                <CopySkillButton url="https://hackathon.xyz/api/v1/skill.md" zh={locale === 'zh'} />
              </div>

              <div className="text-[11px] sm:text-xs font-semibold text-[var(--color-accent)] tracking-[0.18em] uppercase font-mono mb-4">
                {t('home.hero.eyebrow')}
              </div>
              <h1 className="text-[32px] sm:text-[44px] md:text-[56px] lg:text-[64px] font-extrabold text-white leading-[1.1] sm:leading-[1.05] tracking-tight mb-5 sm:mb-6">
                {t('home.hero.h1.line1')}<br />
                {t('home.hero.h1.line2')}
              </h1>
              <p className="text-white/60 text-[15px] sm:text-base md:text-[17px] mb-7 sm:mb-8 leading-relaxed max-w-xl">
                {t('home.hero.subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 mb-8">
                <Link href="/apply-to-host" className="w-full sm:w-auto">
                  <Button size="lg" className="w-full sm:w-auto rounded-md px-6 gap-2 h-11 justify-center">
                    {t('home.hero.cta.primary')} <ArrowRight size={16} />
                  </Button>
                </Link>
                <Link href={LIVE_EVENT_HREF} className="w-full sm:w-auto">
                  <Button size="lg" variant="ghost" className="w-full sm:w-auto rounded-md px-6 h-11 justify-center text-white/80 hover:text-white hover:bg-white/5 border border-white/10">
                    {t('home.hero.cta.secondary')}
                  </Button>
                </Link>
              </div>

              {/* Live-now callout */}
              {SHOW_LIVE_CALLOUT && (
                <Link href={LIVE_EVENT_HREF} className="group block">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/20 transition-colors px-4 py-3 max-w-xl">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-success)] font-mono tracking-wider shrink-0 sm:mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
                      {t('home.hero.live.label')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-white">{t('home.hero.live.title')}</p>
                      <p className="text-[12px] text-white/50">{t('home.hero.live.desc')}</p>
                    </div>
                    <span className="text-[12px] text-white/60 group-hover:text-white transition-colors shrink-0 sm:self-center">
                      {t('home.hero.live.cta')}
                    </span>
                  </div>
                </Link>
              )}
            </div>

            {/* Right: static example review report — hidden on mobile to keep hero tight */}
            <div className="relative hidden lg:block">
              <div className="bg-[#0f0f10] border border-white/10 rounded-xl overflow-hidden shadow-2xl shadow-black/40">
                {/* Header w/ preview badge */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                  <div className="min-w-0">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-mono mb-0.5">{t('home.hero.preview.title')}</p>
                    <p className="text-[13px] font-semibold text-white truncate">{t('home.hero.preview.project')}</p>
                    <p className="text-[11px] text-white/50 mt-0.5">
                      {t('home.hero.preview.submittedVia')}: 🤖 {t('home.hero.preview.submittedVia.agent')}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold font-mono tracking-wider text-white/50 bg-white/5 border border-white/10 rounded px-2 py-1 uppercase">
                    {t('home.hero.preview.badge')}
                  </span>
                </div>

                {/* Dimensions */}
                <div className="px-5 pt-4 pb-3">
                  <p className="text-[10px] text-white/40 mb-3 uppercase tracking-wider font-mono">{t('home.hero.preview.dim.title')}</p>
                  <div className="space-y-2.5">
                    {[
                      { label: t('home.hero.preview.dim.innovation'), score: 8.2, w: '82%', color: 'var(--color-success)' },
                      { label: t('home.hero.preview.dim.technical'), score: 7.5, w: '75%', color: 'var(--color-info)' },
                      { label: t('home.hero.preview.dim.track'), score: 9.0, w: '90%', color: 'var(--color-success)' },
                    ].map((d, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-[11px] text-white/60 w-24 shrink-0">{d.label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: d.w, backgroundColor: d.color }} />
                        </div>
                        <span className="text-[11px] font-bold text-white w-8 text-right font-mono">{d.score.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Model consensus */}
                <div className="px-5 py-3 border-t border-white/10">
                  <p className="text-[10px] text-white/40 mb-2.5 uppercase tracking-wider font-mono">{t('home.hero.preview.consensus')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { model: 'Claude', color: '#f97316' },
                      { model: 'GPT-4o', color: '#a855f7' },
                      { model: 'Gemini', color: '#22c55e' },
                      { model: 'MiniMax', color: '#3b82f6' },
                      { model: 'DeepSeek', color: '#06b6d4' },
                      { model: 'Kimi', color: '#ec4899' },
                      { model: 'GLM', color: '#6366f1' },
                    ].map((m) => (
                      <div key={m.model} className="flex items-center gap-1.5 bg-white/5 rounded-md px-2 py-1">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                        <span className="text-[10px] text-white/70">{m.model}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer: final score + review time */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-black/30 gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-mono mb-0.5">{t('home.hero.preview.finalScore')}</p>
                    <p className="text-lg font-extrabold text-[var(--color-warning)] font-mono leading-none">8.2</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-white/40 uppercase tracking-wider font-mono mb-0.5">{t('home.hero.preview.reviewTime')}</p>
                    <p className="text-sm font-bold text-white font-mono leading-none">47s</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works - 4 cards (Sentry-flavored) */}
      <section id="how" className="px-4 sm:px-6 lg:px-8 py-14 sm:py-20" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
            <div>
              <div className="text-[11px] font-semibold text-[var(--color-fg-muted)] tracking-[0.18em] uppercase mb-2 font-mono">
                {locale === 'zh' ? '工作原理' : 'How it works'}
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--color-fg)] tracking-tight">
                {locale === 'zh' ? '从发布到公布结果，四个阶段' : 'From launch to results, in four stages'}
              </h2>
            </div>
            <Link href="/events/public" className="flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors">
              {locale === 'zh' ? '查看真实案例' : 'See real events'} <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                step: '01', icon: <Users size={18} />,
                title: locale === 'zh' ? '发布活动' : 'Launch',
                desc: locale === 'zh' ? '用 AI 生成赛道、评审维度与报名表单，发布前自行调整。' : 'AI drafts tracks, scoring dimensions and the registration form — you refine before publish.',
                metric: '< 5min', metricLabel: locale === 'zh' ? '上线时间' : 'Time to launch',
              },
              {
                step: '02', icon: <ArrowRight size={18} />,
                title: locale === 'zh' ? '收集项目' : 'Collect',
                desc: locale === 'zh' ? '选手提交 GitHub 链接，系统自动排队分析代码。' : 'Participants submit GitHub links; analysis is queued on arrival.',
                metric: projectsReviewed != null ? String(projectsReviewed) : '—',
                metricLabel: locale === 'zh' ? '已评审项目' : 'Projects reviewed',
              },
              {
                step: '03', icon: <Bot size={18} />,
                title: locale === 'zh' ? 'AI 评审' : 'AI Judge',
                desc: locale === 'zh' ? '七个模型并行打分，分歧样本回到人工复核。' : 'Seven models score in parallel; samples with disagreement flow back to human review.',
                metric: '7', metricLabel: locale === 'zh' ? 'AI 模型' : 'AI Models',
              },
              {
                step: '04', icon: <Trophy size={18} />,
                title: locale === 'zh' ? '公布结果' : 'Publish',
                desc: locale === 'zh' ? '排行榜、评审报告与社区投票同步产出。' : 'Rankings, review reports and community voting ship together.',
                metric: '3', metricLabel: locale === 'zh' ? '同步产出' : 'Outputs shipped',
              },
            ].map((card) => (
              <div
                key={card.step}
                className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 flex flex-col justify-between min-h-[240px] transition-all hover:border-[var(--color-border-strong)] hover:-translate-y-0.5 hover:shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-[11px] font-semibold tracking-[0.18em] text-[var(--color-fg-subtle)] font-mono">{card.step}</span>
                    <span className="w-7 h-7 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-fg-muted)] group-hover:text-[var(--color-accent)] group-hover:border-[var(--color-accent)]/40 transition-colors">
                      {card.icon}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-[var(--color-fg)] mb-1.5">{card.title}</h3>
                  <p className="text-[13px] leading-relaxed text-[var(--color-fg-muted)]">{card.desc}</p>
                </div>
                <div className="mt-6 pt-4 border-t border-[var(--color-border)]">
                  <div className="text-[11px] text-[var(--color-fg-subtle)] mb-1 font-mono uppercase tracking-wider">{card.metricLabel}</div>
                  <div className="text-2xl font-bold text-[var(--color-fg)] font-mono">{card.metric}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For AI Agents */}
      <section className="px-4 sm:px-6 lg:px-8 py-14 sm:py-20 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-10 sm:gap-12 items-center">
          <div>
            <div className="text-[11px] font-semibold text-[var(--color-fg-muted)] tracking-[0.18em] uppercase mb-3 font-mono">
              {locale === 'zh' ? '为 Agent 构建' : 'For AI Agents'}
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--color-fg)] mb-4 tracking-tight">
              {locale === 'zh' ? '把流程交给 Agent' : 'Let the agent handle the flow'}
            </h2>
            <p className="text-[var(--color-fg-muted)] text-[15px] leading-relaxed mb-6 max-w-md">
              {locale === 'zh'
                ? '一份 Skill 文件 + 一个 API Key，Agent 就能完成报名、组队到提交的完整流程。只读接口（/events、/result）开放给所有人，写入接口需要申请 Key。'
                : 'One Skill file and an API Key — your agent handles registration, teaming and submission end-to-end. Read endpoints (/events, /result) are public; write endpoints need a key.'}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <CopySkillCtaButton zh={locale === 'zh'} />
              <Link href="/api-keys">
                <Button size="sm" className="rounded-md px-4 h-9">
                  {locale === 'zh' ? '获取 API Key' : 'Get API Key'}
                </Button>
              </Link>
            </div>
          </div>
          <div className="bg-[#0f0f10] rounded-xl p-6 font-mono text-xs border border-[var(--color-border)] dark:border-white/10">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
              <span className="text-white/50">📄</span>
              <span className="text-[var(--color-accent)]">skill.md</span>
              <span className="ml-auto text-[10px] text-white/30">text/markdown</span>
            </div>
            <div className="space-y-2.5 text-[11px] leading-relaxed">
              <div><span className="text-[#7ee787]">## Agent Flow</span></div>
              <div className="pl-2 space-y-1 text-white/80">
                {[
                  'GET /events',
                  'GET /events/:id/register',
                  'POST /events/:id/register',
                  'GET /events/:id/my-registration',
                  'POST /events/:id/submit',
                  'GET /events/:id/result',
                ].map((step, i) => (
                  <div key={i}><span className="text-white/30">{i + 1}.</span> <span className="text-[#79c0ff]">{step}</span></div>
                ))}
              </div>
              <div className="text-white/30">···</div>
            </div>
            <a href="/api/v1/skill.md" target="_blank" rel="noopener noreferrer"
              className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-white/40 hover:text-[var(--color-accent)] transition-colors">
              <span>{locale === 'zh' ? '查看完整文件 →' : 'View full file →'}</span>
              <span>hackathon.xyz/api/v1/skill.md</span>
            </a>
          </div>
        </div>

        <div className="mt-10 sm:mt-14">
          <div className="text-[11px] font-semibold text-[var(--color-fg-muted)] tracking-[0.18em] uppercase mb-3 font-mono">
            {locale === 'zh' ? '接入方式' : 'Integration Snippets'}
          </div>
          <AgentSnippetTabs zh={locale === 'zh'} />
        </div>
      </section>

      {/* Partners */}
      <section className="px-4 sm:px-6 lg:px-8 py-12 sm:py-14 border-t border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center text-[11px] font-semibold text-[var(--color-fg-muted)] tracking-[0.18em] uppercase mb-8 font-mono">
            {locale === 'zh' ? '合作伙伴' : 'Partners & Ecosystem'}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 md:gap-x-14">
            <PartnerLogo name="OpenBuild" url="https://openbuild.xyz" />
            <PartnerLogo name={locale === 'zh' ? '七牛云' : 'Qiniu Cloud'} url="https://www.qiniu.com" />
            <PartnerLogo name="Kimi" url="https://kimi.moonshot.cn" />
            <PartnerLogo name={locale === 'zh' ? '智谱 AI' : 'Zhipu AI'} url="https://z.ai" icon="https://z-cdn.chatglm.cn/z-ai/static/logo.svg" />
            <PartnerLogo name={locale === 'zh' ? '阶跃星辰' : 'StepFun'} url="https://www.stepfun.com" />
            <PartnerLogo name="Monad" url="https://www.monad.xyz" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 sm:px-6 lg:px-8 py-14 sm:py-20 max-w-7xl mx-auto">
        <div className="relative bg-[#080808] rounded-2xl px-6 sm:px-8 md:px-12 py-10 sm:py-14 flex flex-col md:flex-row md:items-center md:justify-between gap-6 sm:gap-8 text-white overflow-hidden border border-white/10">
          <div className="absolute inset-0 bg-grid-dot opacity-40 pointer-events-none" />
          <div className="absolute -top-20 -right-20 w-[400px] h-[400px] bg-[var(--color-accent)]/30 rounded-full blur-[120px] pointer-events-none" />
          <div className="relative">
            <div className="text-[11px] font-semibold text-white/40 tracking-[0.18em] uppercase mb-3 font-mono">{locale === 'zh' ? '开始使用' : 'Get Started'}</div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2 tracking-tight">{locale === 'zh' ? '让下一场 Hackathon 跑得更轻' : 'Run your next hackathon lighter'}</h2>
            <p className="text-white/60 text-sm">{locale === 'zh' ? '注册后就能创建活动，不收费。' : 'Register and create your first event. No fee.'}</p>
          </div>
          <Link href="/login" className="relative shrink-0">
            <Button size="lg" className="rounded-md px-8 gap-2 h-11 font-semibold">
              {locale === 'zh' ? '开始使用' : 'Get Started'} <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 sm:px-6 lg:px-8 py-8 border-t border-[var(--color-border)] max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[var(--color-fg-muted)]">
        <span>© 2026 HackAgent</span>
        <div className="flex items-center gap-6">
          <Link href="/events/public" className="hover:text-[var(--color-fg)] transition-colors">{locale === 'zh' ? '活动广场' : 'Events'}</Link>
          <a href="/api/v1/skill.md" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:opacity-80 transition-opacity">Skill</a>
          <a href={locale === 'en' ? '/docs.en.html' : '/docs.html'} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-fg)] transition-colors">{locale === 'zh' ? '文档' : 'Docs'}</a>
        </div>
      </footer>
    </div>
  )
}
