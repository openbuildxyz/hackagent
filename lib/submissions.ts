import { createServiceClient } from '@/lib/supabase'
import type { ValidationResult } from '@/lib/validate-project'

type DbClient = ReturnType<typeof createServiceClient>

export type SubmissionInput = {
  eventId: string
  projectId: string
  registrationId: string
  teamId: string | null
  userId: string
  body: Record<string, unknown>
  sanitized: ValidationResult['sanitized']
}

export async function recordSubmissionVersion(db: DbClient, input: SubmissionInput): Promise<number> {
  let query = db
    .from('submissions')
    .select('version')
    .eq('event_id', input.eventId)
    .order('version', { ascending: false })
    .limit(1)

  if (input.teamId) {
    query = query.eq('team_id', input.teamId)
  } else {
    query = query.eq('project_id', input.projectId)
  }

  const { data: latest } = await query.maybeSingle()
  const version = ((latest?.version as number | undefined) ?? 0) + 1

  const { error } = await db.from('submissions').insert({
    event_id: input.eventId,
    project_id: input.projectId,
    registration_id: input.registrationId,
    team_id: input.teamId,
    user_id: input.userId,
    version,
    name: input.sanitized.name,
    github_url: input.sanitized.github_url,
    demo_url: input.sanitized.demo_url,
    description: input.sanitized.description,
    payload: input.body,
  })

  if (error) throw new Error(error.message)
  return version
}
