'use client'
import { useMemo, useState } from 'react'
import {
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleSlash,
  Hand,
  Network,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Undo2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatClock } from '@/components/sim/simTheme'
import { shortName } from '@/lib/agents/format'
import type { AgentEvent, AgentSnapshot, ReplyAction, SimSpeed } from '@/lib/agents/types'
import type { AgentsState } from '@/lib/hooks/useAgents'
import { cn } from '@/lib/utils'
import { AGENT_GOLD, AGENT_STATUS_COLORS, AGENT_STATUS_TEXT, agentStatusKey, type AgentStatusKey } from './agentTheme'

const SPEEDS: SimSpeed[] = [1, 2, 4, 8]
const MAX_ITEMS = 30

const REPLY_STYLES: Record<ReplyAction, string> = {
  accept: 'bg-green-50 text-green-700 ring-green-200',
  adjust: 'bg-amber-50 text-amber-800 ring-amber-200',
  reject: 'bg-slate-100 text-slate-600 ring-slate-200',
}

interface FeedItem {
  root: AgentEvent
  children: AgentEvent[]
}

/** Satu kartu per keputusan / kejadian; balasan dan notice satu gelombang digabung di bawahnya. */
function buildFeed(events: AgentEvent[]): FeedItem[] {
  const groups = new Map<string, FeedItem>()
  const items: FeedItem[] = []
  for (const e of events) {
    const isRoot = ['decision_applied', 'decision_rejected', 'failsafe_enter', 'failsafe_exit', 'override', 'scenario'].includes(e.type)
      || (e.type === 'rollback' && !groups.has(`rb:${e.messageId}`))
    if (isRoot) {
      const item = { root: e, children: [] }
      items.push(item)
      if (e.messageId) groups.set(e.type === 'rollback' ? `rb:${e.messageId}` : e.messageId, item)
      continue
    }
    const parent = e.type === 'rollback' ? groups.get(`rb:${e.messageId}`) : e.messageId ? groups.get(e.messageId) : undefined
    if (parent) parent.children.push(e)
    else if (e.type !== 'notice_sent') items.push({ root: e, children: [] })
  }
  return items.reverse().slice(0, MAX_ITEMS)
}

function TwinChip({ event }: { event: AgentEvent }) {
  if (!event.twin) return null
  const pct = event.twin.improvementPct
  const good = pct > 0
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ring-1',
        good ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-red-50 text-red-700 ring-red-200',
      )}
      title={`Skor twin (antrean + biaya jaringan): ${event.twin.currentScore} → ${event.twin.candidateScore}`}
    >
      Twin {good ? '−' : '+'}
      {Math.abs(pct).toLocaleString('id-ID', { maximumFractionDigits: 1 })}% skor
    </span>
  )
}

const ROOT_ICON: Partial<Record<AgentEvent['type'], { icon: typeof Network; color: string; label: string }>> = {
  decision_applied: { icon: CircleCheck, color: AGENT_GOLD, label: 'Diterapkan otomatis' },
  decision_rejected: { icon: CircleSlash, color: '#64748B', label: 'Ditolak' },
  neighbor_adjusted: { icon: Network, color: AGENT_GOLD, label: 'Menyesuaikan' },
  rollback: { icon: Undo2, color: '#DC2626', label: 'Rollback' },
  failsafe_enter: { icon: ShieldAlert, color: '#DC2626', label: 'Fail-Safe' },
  failsafe_exit: { icon: CircleCheck, color: '#16A34A', label: 'Pulih' },
  override: { icon: Hand, color: '#8F1610', label: 'Override operator' },
  scenario: { icon: Sparkles, color: '#8F1610', label: 'Skenario demo' },
  notice_ignored: { icon: CircleSlash, color: '#64748B', label: 'Notice diabaikan' },
  reply_received: { icon: Network, color: '#64748B', label: 'Balasan' },
}

function ChildLine({ event }: { event: AgentEvent }) {
  if (event.type === 'notice_sent') return null
  if (event.type === 'reply_received') {
    return (
      <li className="text-[11px] leading-snug text-slate-600">
        <span className="font-semibold text-[#111827]">{shortName(event.targetName ?? '')}</span>
        {event.hop && event.hop > 1 ? <span className="text-slate-400"> (hop {event.hop})</span> : null}{' '}
        {event.reply && (
          <span className={cn('rounded px-1 py-px text-[10px] font-bold uppercase ring-1', REPLY_STYLES[event.reply])}>
            {event.reply}
          </span>
        )}{' '}
        <span>{event.summary.split(': ').slice(1).join(': ').replace(/^(accept|adjust|reject),?\s*/, '').replace(/\.$/, '')}</span>
        {event.reason && <span className="block text-slate-500">{event.reason}</span>}
      </li>
    )
  }
  if (event.type === 'neighbor_adjusted') {
    // Ringkasan propagasi (diteruskan / berhenti di batas hop) dari simpang yang menyesuaikan.
    const note = event.reason?.match(/(Diteruskan ke[^.]*\.|Batas \d+ hop tercapai[^.]*\.)/)?.[0]
    if (!note) return null
    return (
      <li className="text-[11px] leading-snug text-slate-500">
        <span className="font-semibold text-slate-600">{shortName(event.agentName)}:</span> {note}
      </li>
    )
  }
  if (event.type === 'notice_ignored') {
    return (
      <li className="text-[11px] leading-snug text-slate-500">
        <span className="font-semibold text-slate-600">{shortName(event.agentName)}:</span> {event.reason}
      </li>
    )
  }
  return (
    <li className="text-[11px] leading-snug text-slate-600">
      {event.summary}
      {event.reason && <span className="block text-slate-500">{event.reason}</span>}
    </li>
  )
}

const CHILD_ORDER = (e: AgentEvent) =>
  e.type === 'reply_received' ? 0 : e.type === 'neighbor_adjusted' || e.type === 'rollback' ? 1 : 2

function FeedCard({ item }: { item: FeedItem }) {
  const { root, children } = item
  const meta = ROOT_ICON[root.type] ?? ROOT_ICON.reply_received!
  const Icon = meta.icon
  const notices = children.filter((c) => c.type === 'notice_sent')
  // Balasan tetangga dulu (urut hop), lalu catatan rambat dan notice yang dibuang.
  const lines = children
    .filter((c) => c.type !== 'notice_sent')
    .sort((a, b) => CHILD_ORDER(a) - CHILD_ORDER(b) || (a.hop ?? 0) - (b.hop ?? 0) || a.seq - b.seq)
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="flex items-start gap-2">
        <Icon size={15} className="mt-0.5 shrink-0" style={{ color: meta.color }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: meta.color }}>
            {meta.label}
            <span className="font-semibold normal-case tracking-normal text-slate-400 tabular-nums">t {formatClock(root.simTimeSec)}</span>
          </p>
          <p className="mt-0.5 text-xs font-semibold leading-snug text-[#111827]">{root.summary}</p>
          {root.reason && <p className="mt-1 text-[11px] leading-snug text-slate-600">{root.reason}</p>}
          {(root.twin || notices.length > 0) && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1">
              <TwinChip event={root} />
              {notices.length > 0 && (
                <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                  {notices.length} notice terkirim · maks. hop {Math.max(...notices.map((n) => n.hop ?? 1))}
                </span>
              )}
            </p>
          )}
          {lines.length > 0 && <ul className="mt-1.5 space-y-1 border-l-2 border-amber-200 pl-2">{lines.map((c) => <ChildLine key={c.seq} event={c} />)}</ul>}
        </div>
      </div>
    </li>
  )
}

function StatusCounts({ agents }: { agents: AgentSnapshot[] }) {
  const counts = agents.reduce<Record<AgentStatusKey, number>>(
    (acc, a) => {
      acc[agentStatusKey(a)]++
      return acc
    },
    { normal: 0, adjusting: 0, failsafe: 0, paused: 0 },
  )
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Status agent">
      {(Object.keys(counts) as AgentStatusKey[]).map((key) => (
        <li key={key} className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <span className="size-2.5 rounded-full ring-2 ring-white" style={{ background: AGENT_STATUS_COLORS[key] }} aria-hidden="true" />
          {AGENT_STATUS_TEXT[key]} <span className="font-semibold tabular-nums text-[#111827]">{counts[key]}</span>
        </li>
      ))}
    </ul>
  )
}

export interface AgentActivityPanelProps {
  agents: AgentsState
  onMinimizeToggle?: () => void
  className?: string
}

export function AgentActivityPanel({ agents, onMinimizeToggle, className }: AgentActivityPanelProps) {
  const { snapshot, events, connected, override, startScenario, stopScenario } = agents
  const [target, setTarget] = useState('all')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const feed = useMemo(() => buildFeed(events), [events])

  const list = snapshot?.agents ?? []
  const targetAgent = list.find((a) => a.id === target) ?? null
  const targetPaused = target === 'all' ? list.length > 0 && list.every((a) => a.paused) : !!targetAgent?.paused

  const run = async (action: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true)
    const result = await action()
    setNotice(result.message)
    setBusy(false)
  }

  return (
    <Card className={cn('flex h-full flex-col overflow-hidden rounded-lg border-border bg-white py-0 shadow-sm', className)}>
      <CardHeader className="shrink-0 gap-1.5 border-b border-border/50 px-4 pb-2.5 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Network size={16} className="shrink-0 text-[#8F1610]" aria-hidden="true" />
            <CardTitle className="truncate text-sm font-semibold leading-none text-[#111827]">Aktivitas Agent</CardTitle>
            <span
              className={cn('size-1.5 shrink-0 rounded-full', connected ? 'bg-green-500 animate-pulse motion-reduce:animate-none' : 'bg-slate-300')}
              title={connected ? 'Stream real-time tersambung' : 'Stream terputus, mencoba lagi'}
              aria-hidden="true"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="border-[#E48E07] text-[10px] font-semibold uppercase tracking-wider text-[#E48E07]">
              Data demo
            </Badge>
            {onMinimizeToggle && (
              <button
                type="button"
                onClick={onMinimizeToggle}
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Sembunyikan panel Aktivitas Agent"
              >
                <ChevronUp size={16} />
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] leading-snug text-slate-500">
          Keputusan otomatis antar simpang. Operator memantau dan boleh override.
        </p>
        {snapshot && <StatusCounts agents={list} />}
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-2.5 scrollbar-hide">
        {/* Kontrol operator: pemantauan dan override saja */}
        <section aria-label="Kontrol operator" className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2">
          <div className="flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#111827]">
              <button
                type="button"
                role="switch"
                aria-checked={snapshot?.autoMode ?? false}
                disabled={!snapshot || busy}
                onClick={() => run(() => override({ action: 'auto_mode', enabled: !snapshot?.autoMode }))}
                className={cn(
                  'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50',
                  snapshot?.autoMode ? 'bg-[#8F1610]' : 'bg-slate-300',
                )}
              >
                <span
                  className={cn(
                    'absolute left-0 top-0.5 size-4 rounded-full bg-white shadow transition-transform',
                    snapshot?.autoMode ? 'translate-x-[18px]' : 'translate-x-0.5',
                  )}
                />
              </button>
              Mode Otomatis
            </label>
            <div className="flex items-center gap-1" role="group" aria-label="Kecepatan jam simulasi">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!snapshot || busy}
                  onClick={() => run(() => override({ action: 'speed', speed: s }))}
                  aria-pressed={snapshot?.speed === s}
                  className={cn(
                    'h-6 rounded-md px-1.5 text-[11px] font-semibold tabular-nums transition-colors',
                    snapshot?.speed === s ? 'bg-[#111827] text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100',
                  )}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-label="Agent yang dikendalikan"
              className="h-7 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-1.5 text-[11px] text-[#111827] focus-visible:outline-2 focus-visible:outline-[#8F1610]"
            >
              <option value="all">Semua simpang</option>
              {list.map((a) => (
                <option key={a.id} value={a.id}>
                  {shortName(a.name)} · {a.statusLabel}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!snapshot || busy}
              onClick={() => run(() => override({ action: targetPaused ? 'resume' : 'pause', agentId: target }))}
              className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[11px] font-semibold text-[#111827] transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {targetPaused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
              {targetPaused ? 'Lanjutkan Agent' : 'Jeda Agent'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={!snapshot || busy}
              onClick={() => run(() => override({ action: 'force_default', agentId: target }))}
              className="flex h-7 items-center justify-center gap-1 rounded-md border border-[#8F1610]/40 bg-white text-[11px] font-semibold text-[#8F1610] transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <RotateCcw size={12} aria-hidden="true" />
              Paksa Siklus Default
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(startScenario)}
              className="flex h-7 items-center justify-center gap-1 rounded-md bg-[#8F1610] text-[11px] font-bold text-white transition-colors hover:bg-[#8F1610]/90 disabled:opacity-50"
            >
              <Sparkles size={12} className="text-amber-300" aria-hidden="true" />
              Picu skenario
            </button>
          </div>

          {snapshot && (
            <p className="flex flex-wrap items-center gap-x-2 text-[10px] leading-4 text-slate-500">
              <span className="tabular-nums">Jam sim {formatClock(snapshot.simTimeSec)} · {snapshot.speed}x</span>
              <span>Log: {snapshot.persistence === 'db' ? 'database' : 'memori'}</span>
              {snapshot.scenario ? (
                <button type="button" disabled={busy} onClick={() => run(stopScenario)} className="font-semibold text-[#8F1610] hover:underline">
                  Skenario aktif · kembali ke live
                </button>
              ) : (
                <span>Prediksi: {snapshot.supervisor.forecastSource}</span>
              )}
            </p>
          )}
          {snapshot?.supervisor.corridorGoal && (
            <p className="line-clamp-2 text-[11px] leading-snug text-slate-600" title={snapshot.supervisor.corridorGoal.objective}>
              <span className="font-semibold text-[#111827]">Tujuan Supervisor:</span> {snapshot.supervisor.corridorGoal.name}.{' '}
              {snapshot.supervisor.corridorGoal.objective}.
            </p>
          )}
          {notice && (
            <p className="truncate text-[11px] text-slate-600" role="status" title={notice}>
              {notice}
            </p>
          )}
        </section>

        {/* Feed real-time */}
        <section aria-label="Feed keputusan agent" aria-live="polite" className="min-h-0">
          {!snapshot && !agents.error && <p className="py-6 text-center text-xs text-slate-400">Memuat status agent…</p>}
          {agents.error && (
            <p className="flex items-center gap-2 rounded-md bg-red-50 p-2 text-xs text-red-700" role="alert">
              <AlertOctagon size={14} aria-hidden="true" /> Status agent tidak dapat dimuat. Peta tetap berjalan.
            </p>
          )}
          {snapshot && feed.length === 0 && (
            <div className="py-6 text-center">
              <p className="text-xs font-medium text-slate-500">Belum ada keputusan.</p>
              <p className="mt-1 text-[11px] text-slate-400">Agent memutuskan sekali per siklus. Tekan “Picu skenario” untuk demo koridor.</p>
            </div>
          )}
          <ol className="space-y-2">
            {feed.map((item) => (
              <FeedCard key={item.root.seq} item={item} />
            ))}
          </ol>
        </section>
      </CardContent>

      <div className="shrink-0 border-t border-[#e5e7eb] bg-[#f9fafb] px-4 py-2 text-[11px] leading-snug text-[#6B7280]">
        <span className="font-semibold text-[#374151]">Simulasi, bukan kontrol langsung sinyal lapangan.</span> Keputusan agent diuji di digital
        twin dan dibatasi guardrail keselamatan.
      </div>
    </Card>
  )
}

/** Chip pembuka saat panel disembunyikan. */
export function AgentActivityChip({ agents, onOpen, className }: { agents: AgentsState; onOpen: () => void; className?: string }) {
  const active = agents.snapshot ? agents.snapshot.supervisor.adjusting + agents.snapshot.supervisor.failsafe : 0
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={false}
      aria-label={`Buka panel Aktivitas Agent, ${active} simpang menyesuaikan atau fail-safe`}
      className={className}
    >
      <Network size={14} className="text-[#8F1610]" />
      <span className="hidden sm:inline">Aktivitas Agent</span>
      {active > 0 && (
        <span className="rounded-full bg-[#E48E07] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{active}</span>
      )}
      <ChevronDown size={12} className="text-slate-400" aria-hidden="true" />
    </button>
  )
}
