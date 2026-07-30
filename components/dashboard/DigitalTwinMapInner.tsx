'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { renderToString } from 'react-dom/server'
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, Marker, useMap } from 'react-leaflet'
import { Camera, AlertTriangle, CalendarDays, Ambulance as AmbulanceIcon, TrendingUp, TrendingDown, MoveRight, MapPin, Video } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { OSRMRoutingService } from '@/lib/services/osrm-routing'

// ─── Types ─────────────────────────────────────────────────────────────────
interface TrafficNode {
  id: string; name: string; lat: number; lng: number
  currentLevel: number; predicted30: number; confidence: number
  recommendation: string | null
}
interface EmergencyVehicle {
  id: string; label: string; originLat: number; originLng: number
  destLat: number; destLng: number; progress: number; etaMinutes: number
  distanceKm: number; greenWaveOn: boolean; status: string
}
interface MapInnerProps {
  nodes: TrafficNode[]; vehicles: EmergencyVehicle[]
  activeTab: 'live' | 'prediction' | 'simulation'
  onNodeSelect: (node: TrafficNode) => void
  onApprove?: (id: string, action: string) => void
  initialOverlays?: Partial<OverlayState>
}

// ─── Forecast configuration ────────────────────────────────────────────────
const FORECAST_CONF: Record<number, { mult: number; confidence: number; label: string }> = {
  0: { mult: 1.00, confidence: 99, label: 'Sekarang' },
  30: { mult: 1.25, confidence: 87, label: '+30 Menit' },
  60: { mult: 1.45, confidence: 72, label: '+60 Menit' },
}

// ─── Simulation scenarios ──────────────────────────────────────────────────
const SCENARIOS = [
  { id: 'existing', label: 'Kondisi Eksisting', congestion: 0, travel: 0, queue: 0 },
  { id: '+5s', label: '+5 dtk Fase Hijau', congestion: -8, travel: -15, queue: -20 },
  { id: '+10s', label: '+10 dtk Fase Hijau', congestion: -15, travel: -28, queue: -35 },
  { id: '+15s', label: '+15 dtk Fase Hijau', congestion: -21, travel: -38, queue: -48 },
  { id: 'diversion', label: 'Alih Arus Sementara', congestion: -32, travel: -55, queue: -65 },
]

// ─── Initialize OSRM routing service ────────────────────────────────────────
const osrm = new OSRMRoutingService()

// ─── Road segment type ──────────────────────────────────────────────────────
interface RoadSegment {
  id: string
  fromNode: TrafficNode
  toNode: TrafficNode
  geometry: [number, number][]
  avgLevel: number
}

// ─── Vehicle route type ─────────────────────────────────────────────────────
interface VehicleRoute {
  vehicleId: string
  geometry: [number, number][]
  distance: number
  duration: number
}

// ─── Node pairs for road segments ──────────────────────────────────────────
const ROAD_CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0], [0, 4], [1, 5], [2, 6], [3, 7], [4, 8], [5, 9]]

// ─── Helpers ───────────────────────────────────────────────────────────────
function getColor(level: number): string {
  if (level < 40) return '#22c55e'
  if (level < 65) return '#eab308'
  return '#ef4444'
}
function getDarkerColor(level: number): string {
  if (level < 40) return '#16a34a'
  if (level < 65) return '#ca8a04'
  return '#dc2626'
}
function interpolatePos(oLat: number, oLng: number, dLat: number, dLng: number, p: number): [number, number] {
  return [oLat + (dLat - oLat) * p, oLng + (dLng - oLng) * p]
}

// ─── Custom Leaflet icons ───────────────────────────────────────────────────
function createDivIcon(html: string, size = 28): L.DivIcon {
  return L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}
const CCTV_ICON = () => createDivIcon(`<div style="background:#1e293b;border:2px solid white;border-radius:6px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.4)">${renderToString(<Video size={14} color="white" />)}</div>`, 28)
const TRAFFIC_LIGHT_ICON = (phase: 'green' | 'yellow' | 'red') => {
  const c = phase === 'green' ? '#22c55e' : phase === 'yellow' ? '#eab308' : '#ef4444'
  // Custom SVG for traffic light since Lucide doesn't have a specific one
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="${c}" stroke="${c}"/></svg>`
  return createDivIcon(`<div style="background:#111827;border:2px solid ${c};border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px ${c}88">${svg}</div>`, 26)
}
const EVENT_ICON = () => createDivIcon(`<div style="background:#7c3aed;border:2px solid white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${renderToString(<CalendarDays size={12} color="white" />)}</div>`, 26)
const CROWD_ICON = () => createDivIcon(`<div style="background:#dc2626;border:2px solid white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${renderToString(<AlertTriangle size={12} color="white" />)}</div>`, 26)
const AMBULANCE_ICON = (green: boolean) => createDivIcon(
  `<div style="background:${green ? '#16a34a' : '#dc2626'};border:2.5px solid white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px ${green ? '#22c55e88' : '#ef444488'}">${renderToString(<AmbulanceIcon size={18} color="white" />)}</div>`, 36
)
const PREDICTION_BADGE_ICON = (level: number, time: number) => createDivIcon(
  `<div style="background:#1e1b4b;color:white;border-radius:8px;padding:3px 6px;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.5);border:1px solid #ef4444">⚠ +${time}min: ${level}%</div>`, 100
)

// ─── Sub-panels (rendered as absolute overlays on the map) ─────────────────

interface OverlayState {
  cctv: boolean; lights: boolean; vehicles: boolean; crowd: boolean; events: boolean
}
function LiveOverlayControls({ overlays, setOverlays }: { overlays: OverlayState; setOverlays: (o: OverlayState) => void }) {
  const toggles: { key: keyof OverlayState; label: string; icon: string }[] = [
    { key: 'cctv', label: 'CCTV', icon: renderToString(<Video size={14} />) },
    { key: 'lights', label: 'Lampu', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>` },
    { key: 'vehicles', label: 'Vanguard', icon: renderToString(<AmbulanceIcon size={14} />) },
    { key: 'crowd', label: 'Laporan', icon: renderToString(<AlertTriangle size={14} />) },
    { key: 'events', label: 'Event', icon: renderToString(<CalendarDays size={14} />) },
  ]
  return (
    <div className="absolute top-3 left-3 z-[900] flex flex-col gap-1.5">
      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 p-2">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 mb-1.5">OVERLAY</p>
        {toggles.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setOverlays({ ...overlays, [key]: !overlays[key] })}
            className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg transition-all text-xs font-bold mb-0.5 ${overlays[key] ? 'bg-[#111827] text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
          >
            <span className="flex items-center justify-center w-5 h-5" dangerouslySetInnerHTML={{ __html: icon }} /> {label}
          </button>
        ))}
      </div>
      {/* Legend */}
      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 p-2">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 mb-1.5">KONDISI</p>
        {[['#22c55e', 'Lancar < 40%'], ['#eab308', 'Sedang 40–65%'], ['#ef4444', 'Macet > 65%']].map(([c, l]) => (
          <div key={c} className="flex items-center gap-2 px-1 py-0.5">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: c }} />
            <span className="text-[10px] font-medium text-slate-600">{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ForecastTimeline({ forecastTime, setForecastTime, confidence }: {
  forecastTime: number; setForecastTime: (t: number) => void; confidence: number
}) {
  const times = [0, 30, 60]
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[900]">
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200 px-4 py-3 flex flex-col items-center gap-2 min-w-[320px]">
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">FORECAST TIMELINE</span>
          <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            Confidence: {confidence}%
          </span>
        </div>
        <div className="relative flex items-center w-full gap-0">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 z-0" />
          {times.map((t, i) => (
            <button
              key={t}
              onClick={() => setForecastTime(t)}
              className={`relative z-10 flex flex-col items-center flex-1 transition-all`}
            >
              <div className={`w-5 h-5 rounded-full border-2 transition-all ${forecastTime === t
                  ? 'bg-blue-600 border-blue-600 scale-125 shadow-lg shadow-blue-200'
                  : forecastTime > t
                    ? 'bg-blue-200 border-blue-400'
                    : 'bg-white border-slate-300'
                }`} />
              <span className={`text-[10px] mt-1.5 font-bold transition-colors ${forecastTime === t ? 'text-blue-700' : 'text-slate-500'
                }`}>
                {t === 0 ? 'Skrg' : `+${t}m`}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function NodeDetailPanel({ node, forecastTime, targetLevel, onClose, tab }: {
  node: TrafficNode; forecastTime: number; targetLevel: number; onClose: () => void; tab: string
}) {
  const trend = targetLevel - node.currentLevel
  const conf = FORECAST_CONF[forecastTime] || FORECAST_CONF[0]
  return (
    <div className="absolute top-3 right-3 z-[900] w-64">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-[#111827] px-4 py-3 flex justify-between items-center">
          <div>
            <p className="text-white font-black text-sm leading-tight">{node.name}</p>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">
              {tab === 'prediction' ? `Prediksi ${conf.label}` : 'Analisis Node'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-lg">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Sekarang</p>
              <p className="text-2xl font-black mt-0.5" style={{ color: getColor(node.currentLevel) }}>{node.currentLevel}%</p>
            </div>
            <div className="text-slate-400 flex items-center justify-center"><MoveRight size={24} /></div>
            <div className="flex-1 text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                {tab === 'prediction' ? conf.label : 'Simulasi'}
              </p>
              <p className="text-2xl font-black mt-0.5" style={{ color: getColor(targetLevel) }}>{Math.round(targetLevel)}%</p>
            </div>
          </div>
          <div className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black ${trend > 0 ? 'bg-red-50 text-red-600' : trend < 0 ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-500'
            }`}>
            <span>{trend > 0 ? <TrendingUp size={16} /> : trend < 0 ? <TrendingDown size={16} /> : <MoveRight size={16} />}</span>
            Trend: {trend > 0 ? '+' : ''}{trend.toFixed(0)}%
          </div>
          {tab === 'prediction' && (
            <div className="flex justify-between text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
              <span>Confidence AI</span>
              <span className="font-black text-blue-600">{conf.confidence}%</span>
            </div>
          )}
          {node.recommendation && (
            <div className="p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-[10px] font-black text-yellow-700 uppercase tracking-widest">REKOMENDASI AI</p>
              <p className="text-xs text-yellow-800 mt-1 font-medium">{node.recommendation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface SimResult { congestion: number; travel: number; queue: number }
function SimulationPanel({ node, onClose, onApprove }: {
  node: TrafficNode; onClose: () => void; onApprove?: (id: string, action: string) => void
}) {
  const [scenario, setScenario] = useState('existing')
  const [result, setResult] = useState<SimResult | null>(null)
  const [running, setRunning] = useState(false)
  const selected = SCENARIOS.find(s => s.id === scenario)!

  const runSim = () => {
    setRunning(true)
    setResult(null)
    setTimeout(() => {
      setRunning(false)
      setResult({ congestion: selected.congestion, travel: selected.travel, queue: selected.queue })
    }, 1200)
  }

  const newLevel = result ? Math.max(0, Math.round(node.currentLevel + (node.currentLevel * result.congestion / 100))) : null
  const baseTravelMin = Math.round(node.currentLevel / 10)
  const newTravelMin = result ? Math.max(1, Math.round(baseTravelMin + (baseTravelMin * result.travel / 100))) : null
  const baseQueue = Math.round(node.currentLevel * 1.5)
  const newQueue = result ? Math.max(0, Math.round(baseQueue + (baseQueue * result.queue / 100))) : null

  return (
    <div className="absolute top-3 right-3 z-[900] w-72">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-purple-900 px-4 py-3 flex justify-between items-center">
          <div>
            <p className="text-white font-black text-sm leading-tight">{node.name}</p>
            <p className="text-purple-300 text-[10px] font-bold uppercase tracking-widest mt-0.5">Panel Simulasi Intervensi</p>
          </div>
          <button onClick={onClose} className="text-purple-300 hover:text-white transition-colors text-lg">✕</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Skenario Intervensi</p>
            <div className="space-y-1.5">
              {SCENARIOS.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setScenario(s.id); setResult(null) }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all ${scenario === s.id
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={runSim}
            disabled={running}
            className="w-full py-2.5 bg-[#111827] hover:bg-slate-800 text-white font-black rounded-xl text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {running ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Menjalankan...
              </>
            ) : '▶ Jalankan Simulasi'}
          </button>

          {result && newLevel !== null && (
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hasil Simulasi</p>
              {[
                { label: 'Kemacetan', before: `${node.currentLevel}%`, after: `${newLevel}%`, change: result.congestion },
                { label: 'Waktu Tempuh', before: `${baseTravelMin} mnt`, after: `${newTravelMin} mnt`, change: result.travel },
                { label: 'Panjang Antrian', before: `${baseQueue}m`, after: `${newQueue}m`, change: result.queue },
              ].map(row => (
                <div key={row.label} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-24 shrink-0 font-medium">{row.label}</span>
                  <span className="text-xs font-bold text-slate-700 text-right">{row.before}</span>
                  <span className="text-slate-400 text-xs">→</span>
                  <span className={`text-xs font-black ${row.change < 0 ? 'text-green-600' : 'text-slate-700'}`}>{row.after}</span>
                  {row.change !== 0 && (
                    <span className={`text-[10px] font-black ml-auto px-1.5 py-0.5 rounded ${row.change < 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                      {row.change > 0 ? '+' : ''}{row.change}%
                    </span>
                  )}
                </div>
              ))}
              {scenario !== 'existing' && onApprove && (
                <button
                  onClick={() => { onApprove(node.id, scenario); onClose() }}
                  className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl text-xs transition-all mt-1"
                >
                  ✓ Terapkan Intervensi Ini
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Map Component ────────────────────────────────────────────────────
export default function DigitalTwinMapInner({ nodes, vehicles, activeTab, onNodeSelect, onApprove }: MapInnerProps) {
  const [overlays, setOverlays] = useState<OverlayState>({ cctv: false, lights: false, vehicles: true, crowd: false, events: false })
  const [forecastTime, setForecastTime] = useState(0)
  const [displayLevels, setDisplayLevels] = useState<Record<string, number>>({})
  const [selectedNode, setSelectedNode] = useState<TrafficNode | null>(null)
  const [roadSegments, setRoadSegments] = useState<RoadSegment[]>([])
  const [vehicleRoutes, setVehicleRoutes] = useState<VehicleRoute[]>([])
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevTabRef = useRef(activeTab)
  const routeCacheRef = useRef<Map<string, VehicleRoute>>(new Map())

  // Initialise display levels from nodes
  const initRef = useRef(false)
  useEffect(() => {
    if (!initRef.current && nodes.length > 0) {
      const init: Record<string, number> = {}
      nodes.forEach(n => { init[n.id] = n.currentLevel })
      setDisplayLevels(init)
      initRef.current = true
    }
  }, [nodes])

  // Load OSRM road segments when nodes change
  useEffect(() => {
    if (nodes.length > 1) {
      loadRoadSegments(nodes)
    }
  }, [nodes])

  // Load OSRM vehicle routes when vehicles change
  useEffect(() => {
    if (vehicles.length === 0) {
      setVehicleRoutes([])
      return
    }
    
    const loadRoutes = async () => {
      const routes: VehicleRoute[] = []
      for (const v of vehicles) {
        const cacheKey = `${v.originLat},${v.originLng};${v.destLat},${v.destLng}`
        const cached = routeCacheRef.current.get(cacheKey)
        if (cached) {
          routes.push(cached)
          continue
        }
        
        const route = await osrm.getRoute(
          [v.originLat, v.originLng],
          [v.destLat, v.destLng],
          'driving',
          { alternatives: 0, steps: false, geometries: 'geojson' }
        )
        
        if (route) {
          const vehicleRoute: VehicleRoute = {
            vehicleId: v.id,
            geometry: route.geometry,
            distance: route.distance / 1000,
            duration: route.duration / 60,
          }
          routeCacheRef.current.set(cacheKey, vehicleRoute)
          routes.push(vehicleRoute)
        } else {
          routes.push({
            vehicleId: v.id,
            geometry: [[v.originLat, v.originLng], [v.destLat, v.destLng]],
            distance: Math.sqrt(Math.pow(v.destLat - v.originLat, 2) + Math.pow(v.destLng - v.originLng, 2)) * 111,
            duration: 0,
          })
        }
      }
      setVehicleRoutes(routes)
    }
    
    loadRoutes()
  }, [vehicles])

  const loadRoadSegments = async function (nodes: TrafficNode[]) {
    const segments: RoadSegment[] = []
    const cache = new Map<string, RoadSegment>()

    const processSegment = async (i: number, j: number) => {
      if (!nodes[i] || !nodes[j]) return null

      const fromId = `${nodes[i].lat},${nodes[i].lng}`
      const toId = `${nodes[j].lat},${nodes[j].lng}`
      const cacheKey = `${fromId}|${toId}`

      if (cache.has(cacheKey)) {
        return cache.get(cacheKey)!
      }

      try {
        const route = await osrm.getRoute(
          [nodes[i].lat, nodes[i].lng],
          [nodes[j].lat, nodes[j].lng]
        )

        if (route) {
          const segment: RoadSegment = {
            id: `route-${i}-${j}`,
            fromNode: nodes[i],
            toNode: nodes[j],
            geometry: route.geometry,
            avgLevel: (getNodeDisplayLevel(nodes[i]) + getNodeDisplayLevel(nodes[j])) / 2
          }

          cache.set(cacheKey, segment)
          segments.push(segment)
          return segment
        }
      } catch (error) {
        console.error('Failed to load OSRM route:', error)
      }

      return null
    }

    const processedRoutes = await Promise.all(
      ROAD_CONNECTIONS.map(async ([i, j]) => {
        const existing = cache.get(
          `${nodes[i].lat},${nodes[i].lng}|${nodes[j].lat},${nodes[j].lng}`
        )
        if (existing) return existing
        return await processSegment(i, j)
      })
    )

    setRoadSegments(processedRoutes.filter((r): r is RoadSegment => r !== null))
  }

  const getCongestionColor = (level: number): string => {
    if (level < 40) return '#22c55e'
    if (level < 65) return '#eab308'
    return '#ef4444'
  }

  const getPredictedLevel = (level: number, time: number, isPrediction: boolean = false): number => {
    if (!isPrediction) return level
    const mult = (FORECAST_CONF[time] || FORECAST_CONF[0]).mult
    return Math.min(100, level * mult)
  }

  // Animated transition when forecast time changes
  useEffect(() => {
    if (animRef.current) clearInterval(animRef.current)
    const mult = (FORECAST_CONF[forecastTime] || FORECAST_CONF[0]).mult
    const targets: Record<string, number> = {}
    nodes.forEach(n => { targets[n.id] = Math.min(100, n.currentLevel * mult) })

    let steps = 0
    const maxSteps = 8
    animRef.current = setInterval(() => {
      setDisplayLevels(prev => {
        const next = { ...prev }
        nodes.forEach(n => {
          const diff = targets[n.id] - (prev[n.id] ?? n.currentLevel)
          next[n.id] = (prev[n.id] ?? n.currentLevel) + diff * 0.4
        })
        return next
      })
      steps++
      if (steps >= maxSteps) clearInterval(animRef.current!)
    }, 80)

    return () => { if (animRef.current) clearInterval(animRef.current) }
  }, [forecastTime])

  const getNodeDisplayLevel = useCallback((node: TrafficNode): number => {
    if (activeTab === 'live') return node.currentLevel
    if (activeTab === 'prediction') return displayLevels[node.id] ?? node.currentLevel
    if (activeTab === 'simulation') return Math.min(100, node.currentLevel * 1.25)
    return node.currentLevel
  }, [activeTab, displayLevels])

  // When tab changes, reset selection
  useEffect(() => { 
    if (activeTab !== prevTabRef.current) {
      setSelectedNode(null)
      setForecastTime(0)
      prevTabRef.current = activeTab
    }
  }, [activeTab])

  const handleNodeClick = (node: TrafficNode) => {
    if (activeTab === 'live') {
      if (onApprove && node.recommendation) onApprove(node.id, 'approve')
      else onNodeSelect(node)
    } else {
      setSelectedNode(prev => prev?.id === node.id ? null : node)
    }
  }

  // Traffic light phases derived from congestion level (mock)
  const getLightPhase = (level: number): 'green' | 'yellow' | 'red' => {
    if (level < 40) return 'green'
    if (level < 65) return 'yellow'
    return 'red'
  }

  const tileUrl = activeTab === 'simulation'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  return (
    <>
      <style>{`
        .leaflet-popup-content-wrapper {
          background: #1e1b4b !important; color: white !important;
          border-radius: 12px !important; padding: 0 !important;
          overflow: hidden !important; box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
        }
        .leaflet-popup-tip { background: #1e1b4b !important; }
        .leaflet-popup-content { margin: 0 !important; width: 280px !important; }
        .leaflet-popup-close-button { display: none !important; }
      `}</style>

      {/* Floating overlays (rendered over the map) */}
      <div className="absolute inset-0 z-[800] pointer-events-none">
        <div className="pointer-events-auto">
          {activeTab === 'live' && (
            <LiveOverlayControls overlays={overlays} setOverlays={setOverlays} />
          )}
          {activeTab === 'prediction' && (
            <ForecastTimeline
              forecastTime={forecastTime}
              setForecastTime={setForecastTime}
              confidence={(FORECAST_CONF[forecastTime] || FORECAST_CONF[0]).confidence}
            />
          )}
          {selectedNode && activeTab === 'prediction' && (
            <NodeDetailPanel
              node={selectedNode}
              forecastTime={forecastTime}
              targetLevel={getNodeDisplayLevel(selectedNode)}
              tab="prediction"
              onClose={() => setSelectedNode(null)}
            />
          )}
          {selectedNode && activeTab === 'simulation' && (
            <SimulationPanel
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
              onApprove={onApprove}
            />
          )}
        </div>
      </div>

      <MapContainer
        center={[-7.28, 112.74]}
        zoom={13}
        className="w-full h-full z-0"
        style={{ minHeight: '400px' }}
      >
        <TileLayer
          attribution={activeTab === 'simulation'
            ? '&copy; <a href="https://carto.com/">CartoDB</a>'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          }
          url={tileUrl}
        />

        {/* Road segments from OSRM (actual road geometries) */}
        {roadSegments.length > 0 && roadSegments.map((segment) => {
          const predictedLevel = activeTab === 'prediction' 
            ? getPredictedLevel(segment.avgLevel, forecastTime, true)
            : segment.avgLevel
          const color = getCongestionColor(predictedLevel)
          
          return (
            <Polyline
              key={segment.id}
              positions={segment.geometry}
              pathOptions={{
                color,
                weight: activeTab === 'simulation' ? 5 : 4,
                opacity: 0.6,
                lineJoin: 'round',
                lineCap: 'round'
              }}
              eventHandlers={{
                mouseover: (e) => {
                  const layer = e.target
                  layer.setStyle({ opacity: 0.9, weight: 6 })
                },
                mouseout: (e) => {
                  const layer = e.target
                  layer.setStyle({ opacity: 0.6, weight: activeTab === 'simulation' ? 5 : 4 })
                },
                click: () => {
                  console.log('Road segment:', {
                    from: segment.fromNode.name,
                    to: segment.toNode.name,
                    congestion: Math.round(predictedLevel)
                  })
                }
              }}
            />
          )
        })}

        {/* Fallback straight lines for missing OSRM routes */}
        {roadSegments.length === 0 && nodes.length > 1 && ROAD_CONNECTIONS.map(([i, j]) => {
          if (!nodes[i] || !nodes[j]) return null
          const avgLevel = (getNodeDisplayLevel(nodes[i]) + getNodeDisplayLevel(nodes[j])) / 2
          const predictedLevel = activeTab === 'prediction'
            ? getPredictedLevel(avgLevel, forecastTime, true)
            : avgLevel
          const color = getCongestionColor(predictedLevel)
          return (
            <Polyline
              key={`fallback-${i}-${j}`}
              positions={[[nodes[i].lat, nodes[i].lng], [nodes[j].lat, nodes[j].lng]]}
              pathOptions={{ 
                color, 
                weight: activeTab === 'simulation' ? 5 : 4, 
                opacity: 0.6,
                dashArray: '5 3'
              }}
            />
          )
        })}

        {/* Traffic node markers */}
        {nodes.map((node) => {
          const level = getNodeDisplayLevel(node)
          const color = getColor(level)
          const isSelected = selectedNode?.id === node.id
          const isPredWorse = activeTab === 'prediction' && level > node.currentLevel + 10

          return (
            <CircleMarker
              key={node.id}
              center={[node.lat, node.lng]}
              radius={isSelected ? 20 : isPredWorse ? 17 : 13}
              pathOptions={{
                color: isSelected ? '#ffffff' : getDarkerColor(level),
                fillColor: color,
                fillOpacity: 0.8,
                weight: isSelected ? 4 : 2.5,
                dashArray: activeTab === 'prediction' && isPredWorse ? '5 3' : undefined,
              }}
              eventHandlers={{ click: () => handleNodeClick(node) }}
            >
              <Popup>
                <div className="text-white">
                  <div className="flex justify-between items-center p-4 pb-3 border-b border-white/10">
                    <div>
                      <h3 className="font-black text-sm">{node.name}</h3>
                      <p className="text-[10px] text-white/50 uppercase font-bold tracking-widest mt-0.5">
                        {activeTab === 'live' ? 'Status Live' : activeTab === 'prediction' ? `Prediksi ${(FORECAST_CONF[forecastTime] || FORECAST_CONF[0]).label}` : 'Mode Simulasi'}
                      </p>
                    </div>
                    <button className="text-white/40 hover:text-white text-base" onClick={() => {
                      (document.querySelector('.leaflet-popup-close-button') as HTMLElement)?.click()
                    }}>✕</button>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/10 rounded-xl p-2.5 text-center">
                        <p className="text-[9px] text-white/50 uppercase font-bold">Live Skrg</p>
                        <p className="text-lg font-black" style={{ color: getColor(node.currentLevel) }}>{node.currentLevel}%</p>
                      </div>
                      <div className="bg-white/10 rounded-xl p-2.5 text-center">
                        <p className="text-[9px] text-white/50 uppercase font-bold">
                          {activeTab === 'live' ? 'Pred 30m' : activeTab === 'prediction' ? (FORECAST_CONF[forecastTime] || FORECAST_CONF[0]).label : '+25% Vol'}
                        </p>
                        <p className="text-lg font-black" style={{ color: getColor(Math.round(level)) }}>{Math.round(level)}%</p>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs bg-white/10 rounded-lg px-3 py-2">
                      <span className="text-white/60">Confidence</span>
                      <span className="font-black text-green-400">{(node.confidence * 100).toFixed(0)}%</span>
                    </div>
                    {node.recommendation && (
                      <div className="bg-[#17153b] border border-[#2d2a5d] rounded-lg p-3">
                        <p className="text-[9px] text-white/50 uppercase font-bold tracking-widest mb-1">AI</p>
                        <p className="text-xs text-[#facc15] font-bold">{node.recommendation}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      {activeTab !== 'live' ? (
                        <button className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-lg transition-colors"
                          onClick={() => handleNodeClick(node)}>
                          {activeTab === 'prediction' ? '📊 Analisis Detail' : '🔮 Buka Simulasi'}
                        </button>
                      ) : onApprove && node.recommendation ? (
                        <button className="flex-1 py-2 bg-[#facc15] hover:bg-[#eab308] text-[#111827] font-black text-xs rounded-lg transition-colors"
                          onClick={() => onApprove(node.id, 'approve')}>
                          ✓ Approve AI
                        </button>
                      ) : (
                        <button className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-lg transition-colors"
                          onClick={() => onNodeSelect(node)}>
                          Detail
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}

        {/* Prediction badges for critical nodes */}
        {activeTab === 'prediction' && nodes.map((node) => {
          const level = getNodeDisplayLevel(node)
          if (level < 70 || forecastTime === 0) return null
          return (
            <Marker
              key={`badge-${node.id}`}
              position={[node.lat + 0.003, node.lng]}
              icon={PREDICTION_BADGE_ICON(Math.round(level), forecastTime)}
              interactive={false}
            />
          )
        })}

        {/* CCTV overlay */}
        {activeTab === 'live' && overlays.cctv && nodes.map((node, i) => (
          <Marker key={`cctv-${node.id}`} position={[node.lat + 0.0015, node.lng - 0.0015]} icon={CCTV_ICON()}>
            <Popup><div className="text-white p-3"><p className="font-bold text-sm">CCTV SITS-{String(i + 1).padStart(4, '0')}</p><p className="text-xs text-white/60 mt-1">{node.name}</p><p className="text-xs text-green-400 font-bold mt-1">● Online</p></div></Popup>
          </Marker>
        ))}

        {/* Traffic lights overlay */}
        {activeTab === 'live' && overlays.lights && nodes.map((node) => {
          const phase = getLightPhase(node.currentLevel)
          return (
            <Marker key={`light-${node.id}`} position={[node.lat - 0.001, node.lng + 0.001]} icon={TRAFFIC_LIGHT_ICON(phase)}>
              <Popup><div className="text-white p-3"><p className="font-bold text-sm">{node.name}</p><p className={`text-xs font-black mt-1 ${phase === 'green' ? 'text-green-400' : phase === 'yellow' ? 'text-yellow-400' : 'text-red-400'}`}>Fase: {phase.toUpperCase()}</p><p className="text-xs text-white/60 mt-1">Durasi Hijau: {phase === 'green' ? '45s' : '30s'}</p></div></Popup>
            </Marker>
          )
        })}

        {/* Crowd reports overlay */}
        {activeTab === 'live' && overlays.crowd && nodes.filter(n => n.currentLevel > 60).map((node) => (
          <Marker key={`crowd-${node.id}`} position={[node.lat + 0.001, node.lng + 0.002]} icon={CROWD_ICON()}>
            <Popup><div className="text-white p-3"><p className="font-bold text-sm">Laporan Masyarakat</p><p className="text-xs text-white/60 mt-1">{node.name}</p><p className="text-xs text-red-400 font-bold mt-1">Kemacetan parah dilaporkan</p></div></Popup>
          </Marker>
        ))}

        {/* Events overlay */}
        {activeTab === 'live' && overlays.events && nodes.slice(0, 2).map((node) => (
          <Marker key={`event-${node.id}`} position={[node.lat - 0.002, node.lng - 0.001]} icon={EVENT_ICON()}>
            <Popup><div className="text-white p-3"><p className="font-bold text-sm">Event Aktif</p><p className="text-xs text-white/60 mt-1">Sekitar {node.name}</p><p className="text-xs text-purple-400 font-bold mt-1">Potensi peningkatan volume</p></div></Popup>
          </Marker>
        ))}

        {/* Vanguard vehicles with OSRM road routes */}
        {(activeTab === 'live' ? overlays.vehicles : true) && vehicles.map((v) => {
          const origin: [number, number] = [v.originLat, v.originLng]
          const dest: [number, number] = [v.destLat, v.destLng]
          const pos = interpolatePos(v.originLat, v.originLng, v.destLat, v.destLng, v.progress)
          const existingRoute = vehicleRoutes.find(r => r.vehicleId === v.id)
          const geo = existingRoute?.geometry ?? [origin, dest]
          const fullLen = geo.length
          const doneIdx = Math.max(1, Math.floor(fullLen * v.progress))
          const doneGeo = geo.slice(0, doneIdx)
          const remGeo = geo.slice(doneIdx - 1)
          return (
            <>
              <Polyline key={`bg-${v.id}`} positions={geo}
                pathOptions={{ color: '#475569', weight: 2, opacity: 0.35, dashArray: '6 5' }} />
              {doneGeo.length >= 2 && (
                <Polyline key={`done-${v.id}`} positions={doneGeo}
                  pathOptions={{ color: v.greenWaveOn ? '#22c55e' : '#3b82f6', weight: 5, opacity: 0.85, lineCap: 'round' }} />
              )}
              {remGeo.length >= 2 && (
                <Polyline key={`rem-${v.id}`} positions={remGeo}
                  pathOptions={{ color: '#ef4444', weight: 4, opacity: 0.55, dashArray: '5 4', lineCap: 'round' }} />
              )}
              <CircleMarker key={`orig-${v.id}`} center={origin} radius={5}
                pathOptions={{ color: '#1e293b', fillColor: '#3b82f6', fillOpacity: 1, weight: 2 }} />
              <CircleMarker key={`dstc-${v.id}`} center={dest} radius={7}
                pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.25, weight: 3, dashArray: '4 3' }} />
              <Marker key={`amb-${v.id}`} position={pos} icon={AMBULANCE_ICON(v.greenWaveOn)}>
                <Popup>
                  <div className="text-white p-4 space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b border-white/10">
                      <div>
                        <h3 className="font-black text-sm">{v.label}</h3>
                        <p className="text-[9px] text-white/50 uppercase font-bold">VANGUARD UNIT</p>
                      </div>
                      <button className="text-white/50 hover:text-white" onClick={() => {
                        (document.querySelector('.leaflet-popup-close-button') as HTMLElement)?.click()
                      }}>✕</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[['ETA', `${v.etaMinutes.toFixed(0)}m`], ['JARAK', `${v.distanceKm}km`], ['GREEN', v.greenWaveOn ? 'ON' : 'OFF']].map(([k, val]) => (
                        <div key={k} className={`rounded-xl p-2 ${k === 'GREEN' && v.greenWaveOn ? 'bg-green-500/30' : 'bg-white/10'}`}>
                          <p className="text-[9px] text-white/50 font-bold">{k}</p>
                          <p className={`text-sm font-black ${k === 'GREEN' ? (v.greenWaveOn ? 'text-green-400' : 'text-white/40') : ''}`}>{val}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-white/50"><span>Asal</span><span className="font-black text-white">{(v.progress * 100).toFixed(0)}%</span><span>Tujuan</span></div>
                      <div className="w-full bg-white/10 rounded-full h-2"><div className="h-2 rounded-full bg-green-400" style={{ width: `${v.progress * 100}%` }} /></div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </>
          )
        })}
      </MapContainer>
    </>
  )
}
