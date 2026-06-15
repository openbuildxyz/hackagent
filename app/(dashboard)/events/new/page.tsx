import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'
import { getServerLocale } from '@/lib/i18n-server'
import zh from '@/lib/i18n/zh'
import en from '@/lib/i18n/en'
import { canCreateEvents, normalizeRoles } from '@/lib/permissions'

// OPE-126: Force dynamic rendering — Vercel ISR can cache a no-session shell on cold start.
export const dynamic = 'force-dynamic'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Lock } from 'lucide-react'
import NewEventForm from './NewEventForm'

export default async function NewEventPage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const db = createServiceClient()
  const locale = await getServerLocale()
  const t = locale === 'en' ? en : zh
  const { data: user } = await db
    .from('users')
    .select('role')
    .eq('id', session.userId)
    .single()

  const roles = normalizeRoles(user?.role)
  const canCreate = canCreateEvents(roles)

  if (!canCreate) {
    return (
      <div className="max-w-xl mx-auto py-16 px-6">
        <Card>
          <CardHeader>
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-3">
              <Lock size={20} />
            </div>
            <CardTitle>{t['events.create.accessRequiredTitle']}</CardTitle>
            <CardDescription>
              {t['events.create.accessRequiredDesc']}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <a href="mailto:hackathon@openbuild.xyz?subject=Upgrade%20to%20organizer">
              <Button>{t['events.create.requestAccess']}</Button>
            </a>
            <Link href="/events/public">
              <Button variant="outline">{t['dashboard.browseEvents']}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <NewEventForm />
}
