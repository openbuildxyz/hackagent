'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { useT } from '@/lib/i18n'

export default function LogoutButton() {
  const router = useRouter()
  const t = useT()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2 mt-1 text-muted-foreground hover:text-foreground"
      onClick={handleLogout}
    >
      <LogOut size={14} />
      {t('nav.logout')}
    </Button>
  )
}
