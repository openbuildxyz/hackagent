'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

export default function DeleteEventButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (!confirm('确认删除该活动？此操作不可撤销。')) return
    setLoading(true)
    try {
      await fetch(`/api/events/${eventId}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground hover:text-destructive"
      disabled={loading}
      onClick={handleDelete}
    >
      <Trash2 size={15} />
    </Button>
  )
}
