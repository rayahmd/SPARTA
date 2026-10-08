'use client'
import { useMemo, useState, useSyncExternalStore } from 'react'
import useSWR from 'swr'
import { Ambulance, ChevronUp, LocateFixed, Zap } from 'lucide-react'
import { DigitalTwinMap } from '@/components/dashboard/DigitalTwinMap'
import { Badge } from '@/components/ui/badge'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface TrafficNode {
  id: string
  name: string
  lat: number
  lng: number
  currentLevel: number
  predicted30: number
  confidence: number
  recommendation: string | null
}

interface EmergencyVehicle {
  id: string
  label: string
  originLat: number
  originLng: number
  destLat: number
  destLng: number
  progress: number
  etaMinutes: number
  distanceKm: number
  greenWaveOn: boolean
  status: string
}

// Panel floating di atas peta, sama seperti di halaman Dashboard.
const PANEL_WIDTH = 380
const GLASS = 'border border-white/70 bg-white/85 shadow-lg backdrop-blur-md'
const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8F1610]'

// Di layar sempit (<1024px) panel default tertutup supaya peta tidak tertutup.
const NARROW_QUERY = '(max-width: 1023px)'
function subscribeNarrow(onChange: () => void) {
  const media = window.matchMedia(NARROW_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const getNarrow = () => window.matchMedia(NARROW_QUERY).matches
const getNarrowOnServer = () => false

function Stat({ label, value, unit, tone = 'neutral' }: {
  label: string
  value: string
  unit?: string
  tone?: 'neutral' | 'green'
}) {
  const green = tone === 'green'
  return (
    <div className={`rounded-lg px-2 py-1.5 text-center ${green ? 'bg-green-50' : 'bg-slate-50'}`}>
      <p className={`truncate text-[9px] font-bold uppercase leading-3 tracking-wide ${green ? 'text-green-700' : 'text-slate-500'}`}>
        {label}
      </p>
      <p className={`mt-0.5 text-base font-bold leading-5 tabular-nums ${green ? 'text-green-700' : 'text-[#111827]'}`}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-semibold text-slate-500">{unit}</span>}
      </p>
    </div>
  )
}

function UnitCard({ vehicle, destination, focused, onLocate, onOverride }: {
  vehicle: EmergencyVehicle
  destination: string
  focused: boolean
  onLocate: () => void
  onOverride: () => void
}) {
  const percent = Math.max(0, Math.min(100, Math.round(vehicle.progress * 100)))
  return (
    <article
      className={`rounded-xl border bg-white p-3 transition-shadow ${
        focused ? 'border-[#8F1610]/60 shadow-md' : 'border-slate-200'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#8F1610]">
          <Ambulance size={18} className="text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-5 text-[#111827]">{vehicle.label}</h3>
          <p className="truncate text-[11px] leading-4 text-slate-500">Menuju {destination}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold leading-4 ${
            vehicle.greenWaveOn ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              vehicle.greenWaveOn ? 'animate-pulse bg-green-500 motion-reduce:animate-none' : 'bg-slate-400'
            }`}
          />
          {vehicle.greenWaveOn ? 'Green wave' : 'Tanpa prioritas'}
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <Stat label="ETA" value={vehicle.etaMinutes.toFixed(0)} unit="mnt" />
        <Stat label="Jarak" value={`${vehicle.distanceKm}`} unit="km" />
        <Stat label="Progres" value={`${percent}`} unit="%" />
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`Progres perjalanan ${percent}%`}
      >
        <div className="h-full rounded-full bg-[#16A34A]" style={{ width: `${percent}%` }} />
      </div>

      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={onLocate}
          className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#8F1610] px-3 text-xs font-bold text-white transition-colors hover:bg-[#8F1610]/90 ${FOCUS_RING}`}
        >
          <LocateFixed size={14} aria-hidden="true" />
          Lihat di peta
        </button>
        <button
          type="button"
          onClick={onOverride}
          className={`h-8 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-[#111827] transition-colors hover:bg-slate-50 ${FOCUS_RING}`}
        >
          Manual override
        </button>
      </div>
    </article>
  )
}

export default function VanguardPage() {
  const { data: nodes = [] } = useSWR<TrafficNode[]>(
    '/api/traffic-nodes', fetcher, { refreshInterval: 5000 }
  )
  const { data: vehicles = [], mutate: mutateVehicles } = useSWR<EmergencyVehicle[]>(
    '/api/vanguard', fetcher, { refreshInterval: 5000 }
  )
  // null = ikuti default (terbuka di layar lebar, tertutup di layar sempit)
  const [panelOpenPref, setPanelOpenPref] = useState<boolean | null>(null)
  const [focusVehicle, setFocusVehicle] = useState<{ id: string; seq: number } | null>(null)
  const [triggering, setTriggering] = useState(false)
  const isNarrow = useSyncExternalStore(subscribeNarrow, getNarrow, getNarrowOnServer)
  const panelOpen = panelOpenPref ?? !isNarrow

  const greenWaveCount = vehicles.filter(v => v.greenWaveOn).length
  const nearestEta = vehicles.length > 0 ? Math.min(...vehicles.map(v => v.etaMinutes)) : null

  // Tujuan kendaraan selalu salah satu persimpangan; tampilkan namanya.
  const destinationOf = (v: EmergencyVehicle) =>
    nodes.find(n => Math.abs(n.lat - v.destLat) < 1e-6 && Math.abs(n.lng - v.destLng) < 1e-6)?.name
    ?? 'lokasi insiden'

  const handleTrigger = async () => {
    setTriggering(true)
    try {
      await fetch('/api/vanguard/trigger', { method: 'POST' })
      await mutateVehicles()
    } finally {
      setTriggering(false)
    }
  }

  const handleLocate = (id: string) => {
    setFocusVehicle(prev => ({ id, seq: (prev?.seq ?? 0) + 1 }))
    if (isNarrow) setPanelOpenPref(false)
  }

  const handleOverride = (v: EmergencyVehicle) => {
    alert(`Manual override untuk ${v.label} diaktifkan. Green Wave dinonaktifkan sementara.`)
  }

  // Area yang tertutup panel floating; marker yang dituju digeser ke luar area ini.
  const focusPadding = useMemo(() => ({
    top: 240,
    bottom: 48,
    left: isNarrow ? 16 : 150,
    right: !isNarrow && panelOpen ? PANEL_WIDTH + 28 : 16,
  }), [isNarrow, panelOpen])

  const headerPill = (
    <div className={`flex max-w-full items-center gap-2.5 rounded-full py-1.5 pl-4 pr-2 ${GLASS}`}>
      <h2 className="truncate text-sm font-bold text-[#111827]">SPARTA Vanguard</h2>
      <Badge
        variant="outline"
        className={`text-xs font-bold uppercase ${
          vehicles.length > 0
            ? 'border-[#16A34A] bg-green-50 text-[#16A34A]'
            : 'border-slate-300 bg-slate-50 text-slate-500'
        }`}
      >
        {vehicles.length > 0 && <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
        {vehicles.length} unit aktif
      </Badge>
    </div>
  )

  const triggerButton = (
    <button
      type="button"
      onClick={handleTrigger}
      disabled={triggering}
      className={`flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#111827] px-3 text-xs font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 ${FOCUS_RING}`}
    >
      <Zap size={14} className="text-amber-300" aria-hidden="true" />
      {triggering ? 'Mengerahkan unit…' : 'Trigger kendaraan baru'}
    </button>
  )

  return (
    // Peta mengisi seluruh area konten di sebelah sidebar; `isolate` menjaga
    // modal (z-50, di body) tetap di atas peta dan panelnya.
    <div className="relative isolate -m-6 h-screen overflow-hidden">
      <DigitalTwinMap
        nodes={nodes}
        vehicles={vehicles}
        onNodeSelect={() => {}}
        topLeftSlot={headerPill}
        focusPadding={focusPadding}
        focusVehicle={focusVehicle}
      />

      <div
        className="pointer-events-none absolute bottom-12 right-3 top-3 z-[850] flex max-w-[calc(100%-1.5rem)] flex-col items-end"
        style={{ width: PANEL_WIDTH }}
      >
        {panelOpen ? (
          <section
            aria-label="Unit darurat SPARTA Vanguard"
            className={`pointer-events-auto flex max-h-full w-full flex-col overflow-hidden rounded-2xl ${GLASS}`}
          >
            <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-[#111827]">Unit darurat</h1>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                  Lampu di sepanjang rute otomatis hijau saat green wave aktif.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpenPref(false)}
                aria-label="Tutup panel unit darurat"
                className={`shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 ${FOCUS_RING}`}
              >
                <ChevronUp size={16} />
              </button>
            </header>

            <div className="grid grid-cols-3 gap-1.5 px-4">
              <Stat label="Unit aktif" value={`${vehicles.length}`} />
              <Stat
                label="Green wave"
                value={`${greenWaveCount}`}
                tone={greenWaveCount > 0 ? 'green' : 'neutral'}
              />
              <Stat
                label="ETA terdekat"
                value={nearestEta === null ? '—' : nearestEta.toFixed(0)}
                unit={nearestEta === null ? undefined : 'mnt'}
              />
            </div>

            {vehicles.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
                  <Ambulance size={20} className="text-slate-400" aria-hidden="true" />
                </div>
                <p className="mt-3 text-sm font-semibold text-[#111827]">Tidak ada kendaraan darurat aktif</p>
                <p className="mx-auto mt-1 max-w-[260px] text-xs leading-5 text-slate-500">
                  Kerahkan unit demo untuk melihat ambulans melaju dan green wave bekerja di peta.
                </p>
              </div>
            ) : (
              <div className="mt-3 min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-1">
                {vehicles.map(v => (
                  <UnitCard
                    key={v.id}
                    vehicle={v}
                    destination={destinationOf(v)}
                    focused={focusVehicle?.id === v.id}
                    onLocate={() => handleLocate(v.id)}
                    onOverride={() => handleOverride(v)}
                  />
                ))}
              </div>
            )}

            <div className="border-t border-slate-200/70 px-4 py-3">{triggerButton}</div>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => setPanelOpenPref(true)}
            aria-expanded={false}
            aria-label={`Buka panel unit darurat, ${vehicles.length} kendaraan aktif`}
            className={`pointer-events-auto inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-[#111827] transition-colors hover:bg-white ${FOCUS_RING} ${GLASS}`}
          >
            <Ambulance size={14} className="text-[#8F1610]" />
            <span className="hidden sm:inline">Unit darurat</span>
            {vehicles.length > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                {vehicles.length}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
