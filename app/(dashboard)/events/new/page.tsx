import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionUser } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase-server'

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
  const { data: user } = await db
    .from('users')
    .select('role')
    .eq('id', session.userId)
    .single()

  const roles: string[] = Array.isArray(user?.role)
    ? user!.role
    : user?.role
      ? [user.role as string]
      : ['viewer']
  const canCreate = roles.includes('admin') || roles.includes('organizer')

  if (!canCreate) {
    return (
      <div className="max-w-xl mx-auto py-16 px-6">
        <Card>
          <CardHeader>
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-3">
              <Lock size={20} />
            </div>
            <CardTitle>Organizer access required</CardTitle>
            <CardDescription>
              Creating events is limited to organizer and admin accounts. If you&apos;d like to host a hackathon, request an upgrade and we&apos;ll get you set up.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <a href="mailto:support@openbuild.xyz?subject=Upgrade%20to%20organizer">
              <Button>Request organizer access</Button>
            </a>
            <Link href="/events/public">
              <Button variant="outline">Browse public events</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <NewEventForm />
}
