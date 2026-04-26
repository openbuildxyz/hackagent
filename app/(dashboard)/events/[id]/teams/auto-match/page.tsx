'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Bot,
  Plus,
  Trash2,
  Loader2,
  Users,
  Sparkles,
} from 'lucide-react'
import { useT } from '@/lib/i18n'

type Participant = {
  id: string
  user_id: string
  name: string
  skills: string
}

type MatchedMember = {
  user_id: string
  name: string
  skills: string[]
}

type TeamGroup = {
  team_name: string
  members: MatchedMember[]
  rationale: string
}

type MatchResult = {
  teams: TeamGroup[]
  unmatched: MatchedMember[]
}

export default function AutoMatchPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const router = useRouter()
  const t = useT()

  const [participants, setParticipants] = useState<Participant[]>([
    { id: crypto.randomUUID(), user_id: '', name: '', skills: '' },
  ])
  const [teamSize, setTeamSize] = useState(4)
  const [bulkInput, setBulkInput] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)
  const [result, setResult] = useState<MatchResult | null>(null)

  function addParticipant() {
    setParticipants(prev => [...prev, { id: crypto.randomUUID(), user_id: '', name: '', skills: '' }])
  }

  function removeParticipant(id: string) {
    setParticipants(prev => prev.filter(p => p.id !== id))
  }

  function updateParticipant(id: string, field: keyof Omit<Participant, 'id'>, value: string) {
    setParticipants(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  function parseBulkInput() {
    const lines = bulkInput.trim().split('\n').filter(l => l.trim())
    const parsed: Participant[] = lines.map(line => {
      const parts = line.split('|').map(s => s.trim())
      return {
        id: crypto.randomUUID(),
        name: parts[0] ?? '',
        user_id: parts[1] ?? '',
        skills: parts[2] ?? '',
      }
    })
    if (parsed.length > 0) {
      setParticipants(parsed)
      setBulkInput('')
      setShowBulk(false)
      toast.success(t('teams.autoMatch.importedToast').replace('{n}', String(parsed.length)))
    }
  }

  async function handleAutoMatch() {
    const validParticipants = participants.filter(p => p.name.trim())
    if (validParticipants.length < 2) {
      toast.error(t('teams.autoMatch.atLeast2'))
      return
    }

    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/teams/auto-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          team_size: teamSize,
          participants: validParticipants.map(p => ({
            user_id: p.user_id.trim() || `participant-${p.id}`,
            name: p.name.trim(),
            skills: p.skills.split(',').map(s => s.trim()).filter(Boolean),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data.result)
      toast.success(t('teams.autoMatch.matchComplete'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('teams.autoMatch.matchFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleApplySuggestions = async () => {
    if (!result) return
    setApplying(true)
    let created = 0
    for (const team of result.teams) {
      try {
        const res = await fetch('/api/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_id: eventId,
            name: team.team_name,
            description: `AI matched team · ${team.rationale?.slice(0, 100) ?? ''}`,
            max_members: team.members.length + 1,
            skills_needed: [...new Set(team.members.flatMap(m => m.skills))].slice(0, 5),
          }),
        })
        if (res.ok) created++
      } catch { /* skip failed teams */ }
    }
    toast.success(t('teams.autoMatch.createdTeams').replace('{n}', String(created)))
    setApplied(true)
    setApplying(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/events/${eventId}/teams`)} aria-label={t('common.back')}>
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bot size={20} />
            {t('teams.autoMatch.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('teams.autoMatch.subtitle')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('teams.autoMatch.settings')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <Label>{t('teams.autoMatch.teamSize')}</Label>
                <Input
                  type="number"
                  min={2}
                  max={8}
                  value={teamSize}
                  onChange={e => setTeamSize(parseInt(e.target.value) || 4)}
                  className="w-24"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {t('teams.autoMatch.participants')} ({participants.filter(p => p.name.trim()).length})
                </CardTitle>
                <div className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setShowBulk(v => !v)}
                  >
                    {t('teams.autoMatch.bulkImport')}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 gap-1" onClick={addParticipant}>
                    <Plus size={12} />
                    {t('teams.autoMatch.add')}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {showBulk && (
                <div className="space-y-2 p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    {t('teams.autoMatch.bulkHint')} <code className="bg-background px-1 rounded">{t('teams.autoMatch.bulkFormat')}</code>
                  </p>
                  <Textarea
                    placeholder={t('teams.autoMatch.bulkPlaceholder')}
                    value={bulkInput}
                    onChange={e => setBulkInput(e.target.value)}
                    rows={5}
                    className="text-xs font-mono"
                  />
                  <Button size="sm" onClick={parseBulkInput} className="w-full">{t('teams.autoMatch.importButton')}</Button>
                </div>
              )}

              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {participants.map((p, idx) => (
                  <div key={p.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-medium">#{idx + 1}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-red-500"
                        onClick={() => removeParticipant(p.id)}
                        disabled={participants.length <= 1}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                    <Input
                      placeholder={t('teams.autoMatch.namePlaceholder')}
                      value={p.name}
                      onChange={e => updateParticipant(p.id, 'name', e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder={t('teams.autoMatch.userIdPlaceholder')}
                      value={p.user_id}
                      onChange={e => updateParticipant(p.id, 'user_id', e.target.value)}
                      className="h-8 text-sm"
                    />
                    <Input
                      placeholder={t('teams.autoMatch.skillsPlaceholder')}
                      value={p.skills}
                      onChange={e => updateParticipant(p.id, 'skills', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Button
            className="w-full gap-2"
            size="lg"
            onClick={handleAutoMatch}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" />{t('teams.autoMatch.matching')}</>
            ) : (
              <><Sparkles size={16} />{t('teams.autoMatch.generate')}</>
            )}
          </Button>
        </div>

        {/* Result Panel */}
        <div>
          {!result && !loading && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground border-2 border-dashed rounded-xl">
              <Bot size={40} className="mb-3 opacity-30" />
              <p className="font-medium">{t('teams.autoMatch.resultPlaceholder')}</p>
              <p className="text-sm mt-1">{t('teams.autoMatch.resultHint')}</p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-muted-foreground">
              <Loader2 size={32} className="animate-spin mb-3" />
              <p>{t('teams.autoMatch.working')}</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-base">
                  {t('teams.autoMatch.recommended').replace('{n}', String(result.teams.length))}
                </h2>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleAutoMatch} disabled={loading || applying}>
                    {t('teams.autoMatch.regenerate')}
                  </Button>
                  {!applied ? (
                    <Button size="sm" onClick={handleApplySuggestions} disabled={applying} className="gap-1.5">
                      {applying ? <><Loader2 size={13} className="animate-spin" />{t('teams.autoMatch.applying')}</> : <>{t('teams.autoMatch.apply')}</>}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => router.push(`/events/${eventId}/teams`)} className="gap-1.5 text-green-700 border-green-300">
                      {t('teams.autoMatch.viewTeams')}
                    </Button>
                  )}
                </div>
              </div>

              {result.teams.map((team, idx) => (
                <Card key={idx} className="border-l-4 border-l-indigo-400">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users size={14} />
                      {team.team_name}
                      <Badge variant="secondary" className="text-xs">{t('teams.autoMatch.membersCount').replace('{n}', String(team.members.length))}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {team.members.map((m, mIdx) => (
                      <div key={mIdx} className="flex items-start gap-2">
                        <span className="text-sm font-medium min-w-[100px]">{m.name}</span>
                        <div className="flex flex-wrap gap-1">
                          {m.skills.map(s => (
                            <span key={s} className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {team.rationale && (
                      <p className="text-xs text-muted-foreground mt-2 pt-2 border-t italic">
                        {team.rationale}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}

              {result.unmatched && result.unmatched.length > 0 && (
                <Card className="border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">{t('teams.autoMatch.unmatched')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {result.unmatched.map((m, i) => (
                        <Badge key={i} variant="secondary">{m.name}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
