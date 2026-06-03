import { redirect } from 'next/navigation'
import { getSessionUserWithRole } from '@/lib/session'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUserWithRole()

  if (!session) {
    redirect('/login?msg=login_required&redirect=/admin')
  }

  if (!session.isAdmin) {
    redirect('/dashboard')
  }

  return children
}
