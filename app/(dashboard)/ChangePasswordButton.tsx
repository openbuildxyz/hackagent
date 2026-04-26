'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { KeyRound } from 'lucide-react'
import { useT } from '@/lib/i18n'

export default function ChangePasswordButton() {
  const [open, setOpen] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState({ newPwd: false, confirm: false })
  const t = useT()

  const newPwdError = useMemo(() => {
    if (!touched.newPwd || !newPassword) return ''
    if (newPassword.length < 8) return t('changePwd.tooShort')
    return ''
  }, [newPassword, touched.newPwd, t])

  const confirmError = useMemo(() => {
    if (!touched.confirm || !confirm) return ''
    if (newPassword !== confirm) return t('changePwd.mismatch')
    return ''
  }, [newPassword, confirm, touched.confirm, t])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched({ newPwd: true, confirm: true })
    if (newPwdError || confirmError) return
    if (newPassword.length < 8) { toast.error(t('changePwd.tooShort')); return }
    if (newPassword !== confirm) { toast.error(t('changePwd.mismatch')); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('changePwd.failed'))
      toast.success(t('changePwd.success'))
      setOpen(false)
      setOldPassword(''); setNewPassword(''); setConfirm('')
      setTouched({ newPwd: false, confirm: false })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('changePwd.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <KeyRound size={14} />
        {t('nav.changePassword')}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setOldPassword(''); setNewPassword(''); setConfirm(''); setTouched({ newPwd: false, confirm: false }) } }}>
        <DialogContent className="sm:max-w-sm bg-bg text-fg">
          <DialogHeader>
            <DialogTitle>{t('nav.changePassword')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="old-pwd">{t('changePwd.oldPwd')}</Label>
              <Input id="old-pwd" type="password" value={oldPassword}
                onChange={e => setOldPassword(e.target.value)} required className="text-foreground bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pwd">{t('changePwd.newPwd')}</Label>
              <Input id="new-pwd" type="password" value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, newPwd: true }))}
                placeholder={t('changePwd.minLength')} required className="text-foreground bg-background" />
              {newPwdError && <p className="text-sm text-destructive">{newPwdError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pwd">{t('changePwd.confirmPwd')}</Label>
              <Input id="confirm-pwd" type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, confirm: true }))}
                required className="text-foreground bg-background" />
              {confirmError && <p className="text-sm text-destructive">{confirmError}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={loading}>{loading ? t('common.saving') : t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
