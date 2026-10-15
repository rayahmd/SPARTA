'use client'
import { useEffect, useMemo, useState } from 'react'
import { BusFront, ChevronDown, ChevronUp, Info, LocateFixed, TrafficCone } from 'lucide-react'
import {
  BUSES,
  BUS_ROUTES,
  activeSignalAdjustments,
  busSnapshot,
  formatAdherence,
  formatEta,
  signalAdjustmentLog,
  upcomingArrivals,
  type Bus,
  type BusSnapshot,
} from '@/lib/simulation/suroboyoBus'

// Panel pelacakan Suroboyo Bus di halaman Vanguard: ringkasan armada, daftar
// bus per koridor dengan estimasi kedatangan di halte berikutnya, dan log
// prioritas sinyal untuk bus yang tertinggal jadwal.

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8F1610]'
const LOG_WINDOW_MS = 30 * 60 * 1000
const LOG_LIMIT = 8
const TIMELINE_STOPS = 5

/** Waktu sekarang (ms), diperbarui tiap `intervalMs`. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

function Stat({ label, value, tone = 'neutral' }: {
  label: string
  value: number
  tone?: 'neutral' | 'green' | 'amber'
}) {
  const box = tone === 'green' ? 'bg-green-50' : tone === 'amber' ? 'bg-amber-50' : 'bg-slate-50'
  const labelColor = tone === 'green' ? 'text-green-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-500'
  const valueColor = tone === 'green' ? 'text-green-700' : tone === 'amber' ? 'text-amber-700' : 'text-[#111827]'
  return (
    <div className={`rounded-lg px-1.5 py-1.5 text-center ${box}`}>
      <p className={`truncate text-[9px] font-bold uppercase leading-3 tracking-wide ${labelColor}`}>{label}</p>
      <p className={`mt-0.5 text-base font-bold leading-5 tabular-nums ${valueColor}`}>{value}</p>
    </div>
  )
}

function RouteChip({ id, color }: { id: string; color: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1.5 text-[10px] font-bold leading-4 text-white"
      style={{ background: color }}
    >
      {id}
    </span>
  )
}

function AdherencePill({ snapshot }: { snapshot: BusSnapshot }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold leading-4 ${
        snapshot.late ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${snapshot.late ? 'bg-amber-500' : 'bg-green-500'}`} />
      {formatAdherence(snapshot.delaySec)}
    </span>
  )
}

/** Detail bus terpilih: halte-halte berikutnya dan simpang bersinyal di depannya. */
function BusDetail({ bus, snapshot, now, onLocate }: {
  bus: Bus
  snapshot: BusSnapshot
  now: number
  onLocate: () => void
}) {
  const stops = upcomingArrivals(bus, now, TIMELINE_STOPS, 'stop')
  const [signal] = upcomingArrivals(bus, now, 1, 'signal')
  const adjustment = activeSignalAdjustments(now).find(a => a.busCode === bus.code)
  return (
    <div className="border-t border-slate-100 px-3 pb-3 pt-2.5">
      <div className="flex items-center justify-between text-[11px] leading-4 text-slate-500">
        <span className="font-semibold">
          {snapshot.dwellingAt ? `Berhenti di halte ${snapshot.dwellingAt}` : 'Halte berikutnya'}
        </span>
        <span className="tabular-nums">{Math.round(snapshot.speedKmh)} km/j</span>
      </div>
      <ol className="mt-1.5">
        {stops.map((arrival, i) => (
          <li key={arrival.eventIndex} className="relative flex items-center gap-2.5 pb-1.5 last:pb-0">
            {i < stops.length - 1 && (
              <span className="absolute left-[4px] top-3 h-full w-px bg-slate-200" aria-hidden="true" />
            )}
            <span
              className="relative h-[9px] w-[9px] shrink-0 rounded-full border-2 bg-white"
              style={{ borderColor: bus.route.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-xs leading-5 text-[#111827]">{arrival.event.name}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{clock(now + arrival.etaSec * 1000)}</span>
            <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-[#111827]">
              {formatEta(arrival.etaSec)}
            </span>
          </li>
        ))}
      </ol>

      {signal && (
        <div
          className={`mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] leading-4 ${
            adjustment ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'
          }`}
        >
          <TrafficCone size={13} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {signal.event.name} · {formatEta(signal.etaSec)}
          </span>
          <span className="shrink-0 font-bold">
            {adjustment ? `Hijau +${adjustment.extendSec} dtk` : 'Siklus normal'}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={onLocate}
        className={`mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-[#8F1610] px-3 text-xs font-bold text-white transition-colors hover:bg-[#8F1610]/90 ${FOCUS_RING}`}
      >
        <LocateFixed size={14} aria-hidden="true" />
        Lacak di peta
      </button>
    </div>
  )
}

export interface SuroboyoBusPanelProps {
  /** Koridor yang ditampilkan; null = semua koridor. */
  routeId: string | null
  onRouteChange: (routeId: string | null) => void
  selectedBusId: string | null
  onSelectBus: (id: string | null) => void
  /** Geser peta ke bus dan ikuti pergerakannya. */
  onLocate: (id: string) => void
  onClose: () => void
  className?: string
}

export function SuroboyoBusPanel({
  routeId,
  onRouteChange,
  selectedBusId,
  onSelectBus,
  onLocate,
  onClose,
  className = '',
}: SuroboyoBusPanelProps) {
  const now = useNow(1000)
  const route = BUS_ROUTES.find(r => r.id === routeId) ?? null

  const fleet = useMemo(
    () =>
      BUSES.filter(bus => !routeId || bus.route.id === routeId).map(bus => ({
        bus,
        snapshot: busSnapshot(bus, now),
        next: upcomingArrivals(bus, now, 1, 'stop')[0],
      })),
    [now, routeId],
  )
  const adjustments = useMemo(
    () => activeSignalAdjustments(now).filter(a => !routeId || a.routeId === routeId),
    [now, routeId],
  )
  const log = useMemo(
    () =>
      signalAdjustmentLog(now, LOG_WINDOW_MS, routeId ? 60 : LOG_LIMIT)
        .filter(entry => !routeId || entry.routeId === routeId)
        .slice(0, LOG_LIMIT),
    [now, routeId],
  )
  const lateCount = fleet.filter(f => f.snapshot.late).length

  return (
    <section
      aria-label="Sinkronisasi Suroboyo Bus"
      className={`pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-2xl ${className}`}
    >
      <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-sm font-semibold text-[#111827]">
            Sinkronisasi Suroboyo Bus
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-green-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500 motion-reduce:animate-none" />
              Live
            </span>
          </h1>
          <p className="mt-0.5 truncate text-[11px] leading-4 text-slate-500">
            {route ? `${route.corridor} · ${route.name}` : `${BUS_ROUTES.length} koridor · estimasi kedatangan per halte`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup panel Suroboyo Bus"
          className={`shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 ${FOCUS_RING}`}
        >
          <ChevronUp size={16} />
        </button>
      </header>

      <div className="grid grid-cols-4 gap-1.5 px-4">
        <Stat label="Bus aktif" value={fleet.length} />
        <Stat label="Tepat waktu" value={fleet.length - lateCount} tone="green" />
        <Stat label="Terlambat" value={lateCount} tone={lateCount > 0 ? 'amber' : 'neutral'} />
        <Stat label="Sinyal diatur" value={adjustments.length} />
      </div>

      <div className="mt-3 flex gap-1.5 px-4" role="group" aria-label="Pilih koridor">
        {[null, ...BUS_ROUTES].map(option => {
          const active = (option?.id ?? null) === routeId
          return (
            <button
              key={option?.id ?? 'all'}
              type="button"
              aria-pressed={active}
              title={option ? `${option.corridor}: ${option.name}` : 'Semua koridor'}
              onClick={() => onRouteChange(option?.id ?? null)}
              className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg border text-[11px] font-bold transition-colors ${FOCUS_RING} ${
                active
                  ? 'border-[#111827] bg-[#111827] text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {option && <span className="h-2 w-2 rounded-full" style={{ background: option.color }} />}
              {option?.id ?? 'Semua'}
            </button>
          )
        })}
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        <ul className="space-y-1.5">
          {fleet.map(({ bus, snapshot, next }) => {
            const selected = bus.id === selectedBusId
            return (
              <li
                key={bus.id}
                className={`overflow-hidden rounded-xl border bg-white transition-shadow ${
                  selected ? 'border-[#8F1610]/60 shadow-md' : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  aria-expanded={selected}
                  onClick={() => onSelectBus(selected ? null : bus.id)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-slate-50 ${FOCUS_RING}`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: bus.route.color }}
                  >
                    <BusFront size={16} className="text-white" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="shrink-0 whitespace-nowrap text-sm font-semibold leading-5 text-[#111827]">{bus.code}</span>
                      <RouteChip id={bus.route.id} color={bus.route.color} />
                      <span className="truncate text-[11px] leading-4 text-slate-500">→ {snapshot.direction.to}</span>
                    </span>
                    <span className="block truncate text-[11px] leading-4 text-slate-500">
                      {snapshot.dwellingAt
                        ? `Berhenti di ${snapshot.dwellingAt}`
                        : next && (
                            <>
                              {next.event.name} ·{' '}
                              <span className="font-bold tabular-nums text-[#111827]">{formatEta(next.etaSec)}</span>
                            </>
                          )}
                    </span>
                  </span>
                  <AdherencePill snapshot={snapshot} />
                  <ChevronDown
                    size={14}
                    className={`shrink-0 text-slate-400 transition-transform ${selected ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {selected && (
                  <BusDetail bus={bus} snapshot={snapshot} now={now} onLocate={() => onLocate(bus.id)} />
                )}
              </li>
            )
          })}
        </ul>

        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Log penyesuaian sinyal</h2>
          {log.length === 0 ? (
            <p className="mt-1.5 text-xs leading-5 text-slate-500">
              Belum ada bus yang tertinggal jadwal dalam 30 menit terakhir.
            </p>
          ) : (
            <ol className="mt-1.5 space-y-1.5">
              {log.map(entry => (
                <li key={entry.key} className="flex items-start gap-2 text-xs leading-4">
                  <span
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${entry.extendSec > 0 ? 'bg-amber-500' : 'bg-slate-300'}`}
                    aria-hidden="true"
                  />
                  <span className="w-9 shrink-0 font-bold tabular-nums text-[#111827]">{clock(entry.timeMs)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[#111827]">{entry.name}</span>
                    <span className="block text-[11px] text-slate-500">Bus {entry.busCode} · {entry.routeId}</span>
                  </span>
                  <span className={`shrink-0 font-bold ${entry.extendSec > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                    {entry.extendSec > 0 ? `+${entry.extendSec} dtk` : 'normal'}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
          <Info size={13} className="mt-px shrink-0" aria-hidden="true" />
          Prioritas hijau diberikan hanya saat bus tertinggal lebih dari 1 menit dari jadwal.
        </p>
      </div>

      <p className="border-t border-slate-200/70 px-4 py-2 text-[10px] leading-4 text-slate-500">
        Koridor dan halte dari OpenStreetMap. Posisi bus disimulasikan dari jadwal, belum dari GPS armada.
      </p>
    </section>
  )
}
