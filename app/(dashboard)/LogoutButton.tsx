'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export default function LogoutButton({
  className,
  labelClassName,
}: {
  className?: string
  labelClassName?: string
}) {
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
      className={cn('w-full justify-start gap-2 mt-1 text-muted-foreground hover:text-foreground', className)}
      onClick={handleLogout}
      aria-label={t('nav.logout')}
    >
      <LogOut size={14} />
      <span className={labelClassName}>{t('nav.logout')}</span>
    </Button>
  )
}
