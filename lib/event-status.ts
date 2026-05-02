export const EVENT_STATUSES = [
  'draft',
  'upcoming',
  'recruiting',
  'hacking',
  'open',
  'judging',
  'done',
  'cancelled',
] as const

export type EventStatus = (typeof EVENT_STATUSES)[number]

export const STATUS_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ['upcoming', 'recruiting', 'cancelled'],
  upcoming: ['recruiting', 'cancelled'],
  recruiting: ['hacking', 'open', 'cancelled'],
  hacking: ['judging'],
  open: ['judging'],
  judging: ['done'],
  done: [],
  cancelled: [],
}

export type EventTiming = {
  registration_open_at?: string | null
  start_time?: string | null
  registration_deadline?: string | null
  submission_deadline?: string | null
  judging_end?: string | null
  result_announced_at?: string | null
}

export function isEventStatus(value: string): value is EventStatus {
  return (EVENT_STATUSES as readonly string[]).includes(value)
}

export function canTransitionEventStatus(from: string, to: string): boolean {
  if (!isEventStatus(from) || !isEventStatus(to)) return false
  return STATUS_TRANSITIONS[from].includes(to)
}

export function isMergedOpenWindow(input: EventTiming): boolean {
  if (!input.registration_deadline || !input.submission_deadline) return false
  return new Date(input.registration_deadline).getTime() === new Date(input.submission_deadline).getTime()
}

export function deriveEventStatus(input: EventTiming & { status?: string | null }, now = new Date()): EventStatus | null {
  if (input.status === 'cancelled' || input.status === 'done') return input.status

  const registrationOpen = input.registration_open_at ? new Date(input.registration_open_at) : null
  const start = input.start_time ? new Date(input.start_time) : null
  const openAt = registrationOpen ?? start
  const regDeadline = input.registration_deadline ? new Date(input.registration_deadline) : null
  const submitDeadline = input.submission_deadline ? new Date(input.submission_deadline) : null
  const judgingEnd = input.judging_end ? new Date(input.judging_end) : null
  const resultAnnouncedAt = input.result_announced_at ? new Date(input.result_announced_at) : null

  if (judgingEnd && now >= judgingEnd) return 'done'
  if (resultAnnouncedAt && now >= resultAnnouncedAt && input.status === 'judging') return 'done'
  if (submitDeadline && now >= submitDeadline) return 'judging'
  if (regDeadline && submitDeadline && regDeadline.getTime() === submitDeadline.getTime()) {
    if (!start || now >= start) return 'open'
  }
  if (regDeadline && now >= regDeadline) return 'hacking'
  if (openAt && now < openAt) return 'upcoming'
  if (openAt && now >= openAt) return 'recruiting'
  return null
}

export function derivePublishStatus(input: Pick<EventTiming, 'registration_open_at' | 'start_time'>, now = new Date()): Extract<EventStatus, 'upcoming' | 'recruiting'> {
  const registrationOpen = input.registration_open_at ? new Date(input.registration_open_at) : null
  const start = input.start_time ? new Date(input.start_time) : null
  const openAt = registrationOpen ?? start

  return openAt && openAt > now ? 'upcoming' : 'recruiting'
}

export function teamMutableStatus(status: string | null | undefined): boolean {
  return status === 'recruiting' || status === 'hacking'
}

export function submissionAllowedStatus(status: string | null | undefined): boolean {
  return status === 'hacking' || status === 'open'
}

export function registrationAllowedStatus(status: string | null | undefined): boolean {
  return status === 'recruiting'
}
