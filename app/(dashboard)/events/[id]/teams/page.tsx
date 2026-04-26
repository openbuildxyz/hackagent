'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
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
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Plus,
  Users,
  Bot,
  ChevronRight,
  Loader2,
  Lock,
  Unlock,
} from 'lucide-react'
import { useT } from '@/lib/i18n'

type TeamMemberUser = { id: string; email: string }
type TeamMember = { id: string; user_id: string; role: string; joined_at: string; users: TeamMemberUser }
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
}

export default function TeamsPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const router = useRouter()
  const t = useT()

  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  // Create form state
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newMax, setNewMax] = useState(4)
  const [newSkills, setNewSkills] = useState('')

  async function loadTeams() {
    setLoading(true)
    try {
      const res = await fetch(`/api/teams?event_id=${eventId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTeams(data.teams ?? [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('teams.hall.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTeams() }, [eventId])

  async function handleCreate() {
    if (!newName.trim()) { toast.error(t('teams.hall.nameRequired')); return }
    setCreating(true)
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          name: newName.trim(),
          description: newDesc.trim() || null,
          max_members: newMax,
          skills_needed: newSkills.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t('teams.hall.teamCreated'))
      setCreateOpen(false)
      setNewName(''); setNewDesc(''); setNewMax(4); setNewSkills('')
      loadTeams()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('teams.hall.createFailed'))
    } finally {
      setCreating(false)
    }
  }

  const openTeams = teams.filter(t => t.status === 'open')
  const closedTeams = teams.filter(t => t.status !== 'open')

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/events/${eventId}`)} aria-label={t('common.back')}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{t('teams.hall.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('teams.hall.subtitle')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/events/${eventId}/teams/auto-match`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Bot size={14} />
              {t('teams.hall.autoMatch')}
            </Button>
          </Link>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            {t('teams.hall.createTeam')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">{t('teams.hall.stats.total')}</p>
            <p className="text-2xl font-bold">{teams.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">{t('teams.hall.stats.open')}</p>
            <p className="text-2xl font-bold text-emerald-600">{openTeams.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">{t('teams.hall.stats.members')}</p>
            <p className="text-2xl font-bold">{teams.reduce((sum, t) => sum + t.team_members.length, 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Teams list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : teams.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">{t('teams.hall.empty.title')}</p>
            <p className="text-sm mt-1">{t('teams.hall.empty.hint')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {openTeams.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t('teams.hall.section.open')} ({openTeams.length})
              </h2>
              <div className="space-y-3">
                {openTeams.map(team => <TeamCard key={team.id} team={team} eventId={eventId} t={t} />)}
              </div>
            </div>
          )}
          {closedTeams.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t('teams.hall.section.closed')} ({closedTeams.length})
              </h2>
              <div className="space-y-3">
                {closedTeams.map(team => <TeamCard key={team.id} team={team} eventId={eventId} t={t} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Team Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>{t('teams.create.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('teams.create.name')}</Label>
              <Input
                placeholder={t('teams.create.namePlaceholder')}
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('teams.create.desc')}</Label>
              <Textarea
                placeholder={t('teams.create.descPlaceholder')}
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('teams.create.maxMembers')}</Label>
              <Input
                type="number"
                min={2}
                max={10}
                value={newMax}
                onChange={e => setNewMax(parseInt(e.target.value) || 4)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('teams.create.skills')}</Label>
              <Input
                placeholder={t('teams.create.skillsPlaceholder')}
                value={newSkills}
                onChange={e => setNewSkills(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('teams.create.skillsHint')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              {t('teams.create.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <><Loader2 size={14} className="animate-spin mr-1" />{t('teams.create.submitting')}</> : t('teams.create.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TeamCard({ team, eventId, t }: { team: Team; eventId: string; t: ReturnType<typeof useT> }) {
  const memberCount = team.team_members.length
  const isFull = memberCount >= team.max_members
  const isOpen = team.status === 'open'
  const isLocked = team.status === 'locked'

  return (
    <Link href={`/events/${eventId}/teams/${team.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="py-4 px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold truncate">{team.name}</h3>
                <Badge variant={isOpen && !isFull ? 'default' : 'secondary'} className="shrink-0">
                  {isOpen ? (
                    isFull
                      ? <><Lock size={10} className="mr-1" />{t('teams.hall.status.full')}</>
                      : <><Unlock size={10} className="mr-1" />{t('teams.hall.status.open')}</>
                  ) : isLocked ? (
                    <><Lock size={10} className="mr-1" />{t('team.locked')}</>
                  ) : t('teams.hall.status.closed')}
                </Badge>
              </div>
              {team.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{team.description}</p>
              )}
              {team.skills_needed.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {team.skills_needed.map(skill => (
                    <span key={skill} className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Users size={13} />
                <span>{t('teams.hall.members').replace('{n}', String(memberCount)).replace('{max}', String(team.max_members))}</span>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground shrink-0 mt-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
