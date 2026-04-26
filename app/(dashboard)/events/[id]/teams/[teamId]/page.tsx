'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { useT, useLocale } from '@/lib/i18n'
import { formatDateLong } from '@/lib/format-date'
import {
  ArrowLeft,
  Users,
  Crown,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Pencil,
  UserPlus,
  Lock,
  Unlock,
  Trash2,
  LogOut,
  AlertTriangle,
} from 'lucide-react'

type UserInfo = { id: string; email: string }
type TeamMember = { id: string; user_id: string; role: string; joined_at: string; users: UserInfo }
type JoinRequest = { id: string; user_id: string; message: string | null; status: string; created_at: string; users: UserInfo }
type Team = {
  id: string
  event_id: string
  name: string
  description: string | null
  leader_id: string
  max_members: number
  skills_needed: string[]
  status: string
  created_at: string
  team_members: TeamMember[]
  team_join_requests: JoinRequest[]
}

export default function TeamDetailPage() {
  const { id: eventId, teamId } = useParams<{ id: string; teamId: string }>()
  const router = useRouter()
  const t = useT()
  const [locale] = useLocale()

  const [team, setTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Join dialog
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinMessage, setJoinMessage] = useState('')
  const [joining, setJoining] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  // Edit dialog (leader only)
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editMax, setEditMax] = useState(4)
  const [editSkills, setEditSkills] = useState('')
  const [editStatus, setEditStatus] = useState('open')
  const [saving, setSaving] = useState(false)

  // Request processing
  const [processingReqId, setProcessingReqId] = useState<string | null>(null)

  // Disband dialog
  const [disbandOpen, setDisbandOpen] = useState(false)
  const [disbandConfirmName, setDisbandConfirmName] = useState('')
  const [disbanding, setDisbanding] = useState(false)

  // Leave dialog
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)

  // Lock toggle
  const [togglingLock, setTogglingLock] = useState(false)

  async function loadCurrentUser() {
    try {
      const res = await fetch('/api/me')
      if (res.ok) {
        const data = await res.json()
        setCurrentUserId(data.user?.id ?? null)
      }
    } catch {
      // ignore
    }
  }

  async function loadTeam() {
    setLoading(true)
    try {
      const res = await fetch(`/api/teams/${teamId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTeam(data.team)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('teams.hall.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCurrentUser()
    loadTeam()
  }, [teamId])

  function openEdit() {
    if (!team) return
    setEditName(team.name)
    setEditDesc(team.description ?? '')
    setEditMax(team.max_members)
    setEditSkills(team.skills_needed.join(', '))
    setEditStatus(team.status)
    setEditOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || null,
          max_members: editMax,
          skills_needed: editSkills.split(',').map(s => s.trim()).filter(Boolean),
          status: editStatus,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Team updated')
      setEditOpen(false)
      loadTeam()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update team')
    } finally {
      setSaving(false)
    }
  }

  async function handleJoin() {
    setJoining(true)
    try {
      const res = await fetch(`/api/teams/${teamId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: joinMessage.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Join request sent!')
      setJoinOpen(false)
      setJoinMessage('')
      loadTeam()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send join request')
    } finally {
      setJoining(false)
    }
  }

  async function handleRequest(reqId: string, action: 'approve' | 'reject') {
    setProcessingReqId(reqId)
    try {
      const res = await fetch(`/api/teams/${teamId}/requests/${reqId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(action === 'approve' ? 'Member approved!' : 'Request rejected')
      loadTeam()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to process request')
    } finally {
      setProcessingReqId(null)
    }
  }

  async function handleToggleLock() {
    if (!team) return
    setTogglingLock(true)
    try {
      const newStatus = team.status === 'locked' ? 'open' : 'locked'
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(newStatus === 'locked' ? t('team.lock.success') : t('team.unlock.success'))
      loadTeam()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update team')
    } finally {
      setTogglingLock(false)
    }
  }

  async function handleDisband() {
    setDisbanding(true)
    try {
      const res = await fetch(`/api/teams/${teamId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t('team.disband.success'))
      router.push(`/events/${eventId}/teams`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disband team')
    } finally {
      setDisbanding(false)
    }
  }

  async function handleLeave() {
    setLeaving(true)
    try {
      const res = await fetch(`/api/teams/${teamId}/leave`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.disbanded) {
        toast.success(t('team.disband.success'))
      } else {
        toast.success(t('team.leave.success'))
      }
      router.push(`/events/${eventId}/teams`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to leave team')
    } finally {
      setLeaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!team) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center text-muted-foreground">
        Team not found.
      </div>
    )
  }

  // Disbanded team
  if (team.status === 'disbanded') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 text-center">
        <AlertTriangle size={40} className="mx-auto mb-3 text-muted-foreground opacity-40" />
        <p className="font-medium text-muted-foreground">{t('team.disbanded')}</p>
        <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={() => router.push(`/events/${eventId}/teams`)}>
          <ArrowLeft size={14} />
          {t('common.back')}
        </Button>
      </div>
    )
  }

  const isLeader = currentUserId === team.leader_id
  const isMember = team.team_members.some(m => m.user_id === currentUserId)
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch(`/api/teams/${teamId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '邀请失败')
      toast.success('邀请已发送！')
      setInviteEmail('')
      setInviteOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '邀请失败')
    } finally {
      setInviting(false)
    }
  }

  const pendingRequests = team.team_join_requests.filter(r => r.status === 'pending')
  const isFull = team.team_members.length >= team.max_members
  const myRequest = team.team_join_requests.find(r => r.user_id === currentUserId)
  const isLocked = team.status === 'locked'

  // Status badge
  function statusBadge(team: Team) {
    if (isLocked) {
      return (
        <Badge variant="secondary" className="gap-1">
          <Lock size={10} />
          {t('team.locked')}
        </Badge>
      )
    }
    if (team.status === 'open') {
      return isFull
        ? <Badge variant="secondary" className="gap-1"><Lock size={10} />Full</Badge>
        : <Badge variant="default" className="gap-1"><Unlock size={10} />Open</Badge>
    }
    return <Badge variant="secondary">Closed</Badge>
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/events/${eventId}/teams`)}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{team.name}</h1>
              {statusBadge(team)}
            </div>
            {team.description && (
              <p className="text-sm text-muted-foreground mt-1">{team.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          {/* Leader actions */}
          {isLeader && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleToggleLock}
                disabled={togglingLock}
              >
                {togglingLock ? <Loader2 size={14} className="animate-spin" /> :
                  isLocked ? <Unlock size={14} /> : <Lock size={14} />}
                {isLocked ? t('team.unlock') : t('team.lock')}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={openEdit}>
                <Pencil size={14} />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={() => { setDisbandConfirmName(''); setDisbandOpen(true) }}
              >
                <Trash2 size={14} />
                {t('team.disband')}
              </Button>
            </>
          )}
          {/* Member (non-leader) leave button */}
          {isMember && !isLeader && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
              onClick={() => setLeaveOpen(true)}
            >
              <LogOut size={14} />
              {t('team.leave')}
            </Button>
          )}
          {/* Non-member join */}
          {!isMember && !myRequest && team.status === 'open' && !isFull && (
            <Button size="sm" className="gap-1.5" onClick={() => setJoinOpen(true)}>
              <UserPlus size={14} />
              Apply to Join
            </Button>
          )}
          {myRequest && myRequest.status === 'pending' && (
            <Badge variant="outline" className="gap-1">
              <Clock size={12} />
              Request Pending
            </Badge>
          )}
        </div>
      </div>

      {/* Skills needed */}
      {team.skills_needed.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Looking for:</p>
          <div className="flex flex-wrap gap-1.5">
            {team.skills_needed.map(skill => (
              <span key={skill} className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2.5 py-1 text-xs font-medium dark:bg-blue-950 dark:text-blue-300">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Members */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users size={16} />
            Members ({team.team_members.length}/{team.max_members})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {team.team_members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.team_members.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {m.role === 'leader' && <Crown size={13} className="text-amber-500" />}
                        {m.users?.email ?? m.user_id}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.role === 'leader' ? 'default' : 'secondary'}>
                        {m.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDateLong(m.joined_at, locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Join Requests (leader only) */}
      {isLeader && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock size={16} />
              Join Requests
              {pendingRequests.length > 0 && (
                <Badge className="ml-1">{pendingRequests.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {team.team_join_requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No join requests yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.team_join_requests.map(req => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.users?.email ?? req.user_id}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {req.message || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          req.status === 'approved' ? 'default' :
                          req.status === 'rejected' ? 'destructive' : 'secondary'
                        }>
                          {req.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {req.status === 'pending' && (
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                              disabled={processingReqId === req.id || isFull}
                              onClick={() => handleRequest(req.id, 'approve')}
                            >
                              {processingReqId === req.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 text-red-500 border-red-300 hover:bg-red-50"
                              disabled={processingReqId === req.id}
                              onClick={() => handleRequest(req.id, 'reject')}
                            >
                              <XCircle size={12} />
                              Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Apply to Join Dialog */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply to Join &quot;{team.name}&quot;</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Message (optional)</Label>
              <Textarea
                placeholder="Introduce yourself and your skills..."
                value={joinMessage}
                onChange={e => setJoinMessage(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJoinOpen(false)} disabled={joining}>
              Cancel
            </Button>
            <Button onClick={handleJoin} disabled={joining}>
              {joining ? <><Loader2 size={14} className="animate-spin mr-1" />Sending...</> : 'Send Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Team Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Team Name *</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Max Members</Label>
              <Input type="number" min={2} max={10} value={editMax} onChange={e => setEditMax(parseInt(e.target.value) || 4)} />
            </div>
            <div className="space-y-1.5">
              <Label>Skills Needed (comma-separated)</Label>
              <Input value={editSkills} onChange={e => setEditSkills(e.target.value)} placeholder="React, Solidity, Design" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="flex gap-2">
                {(['open', 'locked', 'closed'] as const).map(s => (
                  <Button
                    key={s}
                    type="button"
                    variant={editStatus === s ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEditStatus(s)}
                  >
                    {s === 'open' ? <Unlock size={13} className="mr-1" /> : <Lock size={13} className="mr-1" />}
                    {s === 'open' ? 'Open' : s === 'locked' ? t('team.locked') : 'Closed'}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 size={14} className="animate-spin mr-1" />Saving...</> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disband Team Dialog */}
      <Dialog open={disbandOpen} onOpenChange={setDisbandOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle size={18} />
              {t('team.disband.title')}
            </DialogTitle>
            <DialogDescription>{t('team.disband.warning')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {t('team.disband.confirm').replace('{name}', team.name)}
            </p>
            <Input
              placeholder={t('team.disband.confirmPlaceholder')}
              value={disbandConfirmName}
              onChange={e => setDisbandConfirmName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisbandOpen(false)} disabled={disbanding}>
              {t('team.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisband}
              disabled={disbanding || disbandConfirmName !== team.name}
            >
              {disbanding ? <><Loader2 size={14} className="animate-spin mr-1" />{t('team.disband')}</> : t('team.disband')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Team Dialog */}
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('team.leave.title')}</DialogTitle>
            <DialogDescription>
              {team.team_members.length <= 1
                ? t('team.lastMember')
                : t('team.leave.confirm')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveOpen(false)} disabled={leaving}>
              {t('team.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleLeave} disabled={leaving}>
              {leaving ? <><Loader2 size={14} className="animate-spin mr-1" />{t('team.leave')}</> : t('team.leave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
