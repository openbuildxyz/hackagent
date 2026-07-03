'use client'

import { UserCircle2 } from 'lucide-react'
import LogoutButton from './LogoutButton'

const ROLE_BADGE_CLASSES: Record<string, string> = {
  admin: 'border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.10)] text-[var(--color-danger)]',
  super_admin: 'border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.10)] text-[var(--color-danger)]',
  organizer: 'border-[rgba(124,58,237,0.35)] bg-[rgba(124,58,237,0.10)] text-violet-600 dark:text-violet-300',
  reviewer: 'border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.10)] text-[var(--color-info)]',
  viewer: 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-fg-muted)]',
}

function displayNameFromEmail(email: string) {
  const localPart = email.split('@')[0]?.trim()
  return localPart || email
}

export default function DashboardTopBar({
  name,
  email,
  role = ['viewer'],
}: {
  name?: string | null
  email: string
  role?: string[]
}) {
  const displayName = name?.trim() || displayNameFromEmail(email)
  const roles = role.length > 0 ? role : ['viewer']

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 px-4 py-2.5 backdrop-blur sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-2">
        <div className="min-w-0 flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5">
          <UserCircle2 size={18} className="shrink-0 text-[var(--color-fg-muted)]" />
          <div className="min-w-0 text-right leading-tight">
            <p className="truncate text-xs font-semibold text-[var(--color-fg)] sm:text-sm">{displayName}</p>
            <p className="hidden max-w-[14rem] truncate text-[11px] text-[var(--color-fg-muted)] sm:block">{email}</p>
          </div>
        </div>

        <div className="hidden max-w-[18rem] flex-wrap justify-end gap-1 md:flex">
          {roles.map((item) => (
            <span
              key={item}
              className={`inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-medium ${ROLE_BADGE_CLASSES[item] ?? ROLE_BADGE_CLASSES.viewer}`}
            >
              {item}
            </span>
          ))}
        </div>

        <LogoutButton
          className="mt-0 h-9 w-9 justify-center px-0 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] sm:w-auto sm:px-3"
          labelClassName="hidden sm:inline"
        />
      </div>
    </header>
  )
}
