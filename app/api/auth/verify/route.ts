import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendWelcomeEmail } from '@/lib/mail'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', request.url))
  }

  const db = createServiceClient()

  const { data: user } = await db
    .from('users')
    .select('id, email, verify_expires_at')
    .eq('verify_token', token)
    .single()

  if (!user) {
    return NextResponse.redirect(new URL('/login?error=invalid_token', request.url))
  }

  if (new Date(user.verify_expires_at) < new Date()) {
    return NextResponse.redirect(new URL('/login?error=token_expired', request.url))
  }

  await db
    .from('users')
    .update({ email_verified: true, verify_token: null, verify_expires_at: null })
    .eq('id', user.id)

  // Send welcome email (fire and forget)
  sendWelcomeEmail(user.email).catch(() => {})

  return NextResponse.redirect(new URL('/login?verified=1', request.url))
}
