'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Users, ChevronDown } from 'lucide-react'
import { useLocale } from '@/lib/i18n'
import { formatDateLong } from '@/lib/format-date'

type User = {
  id: string
  email: string
  role: string[]
  credits: number
  created_at: string
}

const ALL_ROLES = ['admin', 'organizer', 'reviewer', 'viewer']

const ROLE_COLORS: Record<string, string> = {
  admin:     'bg-red-100 text-red-700',
  organizer: 'bg-purple-100 text-purple-700',
  reviewer:  'bg-blue-100 text-blue-700',
  viewer:    'bg-surface-2 text-fg-muted',
}

export default function AdminUsersPage() {
  const [locale] = useLocale()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [pendingRole, setPendingRole] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/admin/users').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setUsers(data)
      setLoading(false)
    })
  }, [])

  const filtered = users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()))

  const startEdit = (u: User) => {
    setEditing(u.id)
    setPendingRole(prev => ({ ...prev, [u.id]: [...u.role] }))
  }

  const toggleRole = (userId: string, role: string) => {
    setPendingRole(prev => {
      const cur = prev[userId] ?? []
      return {
        ...prev,
        [userId]: cur.includes(role) ? cur.filter(r => r !== role) : [...cur, role],
      }
    })
  }

  const save = async (userId: string) => {
    setSaving(userId)
    const role = pendingRole[userId] ?? []
    if (role.length === 0) { toast.error('至少选择一个角色'); setSaving(null); return }
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    })
    setSaving(null)
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
      setEditing(null)
      toast.success('角色已更新')
    } else {
      toast.error('保存失败')
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Users size={22} className="text-fg-muted" />
          <div>
            <h1 className="text-2xl font-bold">用户管理</h1>
            <p className="text-muted-foreground text-sm mt-0.5">管理用户角色和权限</p>
          </div>
        </div>
        <span className="text-sm text-fg-subtle">{users.length} 个用户</span>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="搜索邮箱..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm border border-token rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-strong)]"
        />
      </div>

      <div className="bg-bg rounded-xl border border-token overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-token bg-surface">
              <th className="text-left px-5 py-3 font-medium text-fg-muted">邮箱</th>
              <th className="text-left px-5 py-3 font-medium text-fg-muted">角色</th>
              <th className="text-left px-5 py-3 font-medium text-fg-muted">积分</th>
              <th className="text-left px-5 py-3 font-medium text-fg-muted">注册时间</th>
              <th className="text-right px-5 py-3 font-medium text-fg-muted">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">加载中...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-muted-foreground">暂无用户</td></tr>
            ) : filtered.map(user => (
              <tr key={user.id} className="border-b border-token hover:bg-[var(--color-surface)]/50 transition-colors">
                <td className="px-5 py-3 font-medium text-fg">{user.email}</td>
                <td className="px-5 py-3">
                  {editing === user.id ? (
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_ROLES.map(r => {
                        const active = (pendingRole[user.id] ?? []).includes(r)
                        return (
                          <button
                            key={r}
                            onClick={() => toggleRole(user.id, r)}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                              active
                                ? 'border-[var(--color-fg)] bg-[var(--color-fg)] text-white'
                                : 'border-token text-fg-muted hover:border-[var(--color-border-strong)]'
                            }`}
                          >
                            {r}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {(user.role ?? []).map(r => (
                        <span key={r} className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[r] ?? 'bg-surface-2 text-fg-muted'}`}>
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3 text-fg-muted">{user.credits}</td>
                <td className="px-5 py-3 text-fg-subtle">{formatDateLong(user.created_at, locale)}</td>
                <td className="px-5 py-3 text-right">
                  {editing === user.id ? (
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>取消</Button>
                      <Button size="sm" onClick={() => save(user.id)} disabled={saving === user.id}>
                        {saving === user.id ? '保存中...' : '保存'}
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => startEdit(user)}>
                      修改角色
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
