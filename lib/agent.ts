import crypto from 'crypto'

const ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789'

function randomId(len: number): string {
  const bytes = crypto.randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) {
    out += ALPHA[bytes[i] % ALPHA.length]
  }
  return out
}

export function generateAgentId(): string {
  return `agt_${randomId(8)}`
}

export function generateClaimToken(): { token: string; hash: string } {
  const token = `ct_${randomId(24)}`
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  return { token, hash }
}

export function hashClaimToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export const AGENT_PUBLIC_FIELDS =
  'id, agent_name, owner_user_id, owner_email, model, framework, capabilities, github, statement, parent_agent_id, created_at'
