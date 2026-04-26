'use client'

import { useT, type TranslationKey } from '@/lib/i18n'

const STEPS: Array<{ key: string; label: TranslationKey }> = [
  { key: 'draft', label: 'event.status.draft' },
  { key: 'recruiting', label: 'event.status.recruiting' },
  { key: 'hacking', label: 'event.status.hacking' },
  { key: 'judging', label: 'event.status.judging' },
  { key: 'done', label: 'event.status.done' },
]

const STEP_INDEX: Record<string, number> = {
  draft: 0,
  recruiting: 1,
  hacking: 2,
  judging: 3,
  done: 4,
}

export default function EventStatusStepper({
  status,
  className = '',
}: {
  status: string
  className?: string
}) {
  const t = useT()

  if (status === 'cancelled') {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${className}`}
        style={{
          background: 'color-mix(in oklab, var(--color-danger) 12%, transparent)',
          color: 'var(--color-danger)',
          border: '1px solid color-mix(in oklab, var(--color-danger) 35%, transparent)',
        }}
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: 'var(--color-danger)' }}
        />
        {t('event.status.cancelled')}
      </div>
    )
  }

  const currentIdx = STEP_INDEX[status] ?? -1

  return (
    <div className={`flex items-start ${className}`}>
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx
        const active = idx === currentIdx
        const isLast = idx === STEPS.length - 1

        const circleStyle: React.CSSProperties = active
          ? {
              background: 'color-mix(in oklab, var(--color-accent) 15%, transparent)',
              color: 'var(--color-accent)',
              border: '2px solid var(--color-accent)',
            }
          : done
          ? {
              background: 'var(--color-accent)',
              color: 'var(--color-accent-fg)',
              border: '2px solid var(--color-accent)',
            }
          : {
              background: 'var(--color-bg)',
              color: 'var(--color-fg-subtle)',
              border: '2px solid var(--color-border)',
            }

        const labelStyle: React.CSSProperties = active
          ? { color: 'var(--color-accent)', fontWeight: 600 }
          : done
          ? { color: 'var(--color-fg-muted)' }
          : { color: 'var(--color-fg-subtle)' }

        const lineStyle: React.CSSProperties = {
          background: done ? 'var(--color-accent)' : 'var(--color-border)',
        }

        return (
          <div key={step.key} className="flex flex-col items-center shrink-0 flex-1 last:flex-none last:shrink-0">
            <div className="flex items-center w-full">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                style={circleStyle}
                aria-current={active ? 'step' : undefined}
              >
                {done ? (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              {!isLast && <div className="flex-1 h-0.5 mx-1" style={lineStyle} />}
            </div>
            <span
              className="mt-1.5 text-xs hidden sm:block text-center leading-tight w-full"
              style={labelStyle}
            >
              {t(step.label)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
