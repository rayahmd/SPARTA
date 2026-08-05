'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { renderToString } from 'react-dom/server'
import {
  Map as MapLibreMap,
  Marker,
  Popup,
  NavigationControl,
  type GeoJSONSource,
  type RasterTileSource,
  type StyleSpecification,
  type MapLayerMouseEvent,
  setWorkerUrl,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { AlertTriangle, CalendarDays, Ambulance as AmbulanceIcon, TrendingUp, TrendingDown, MoveRight, Video } from 'lucide-react'
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
interface OverlayState {
  cctv: boolean; lights: boolean; vehicles: boolean; crowd: boolean; events: boolean
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

// ─── Configure MapLibre GL worker (required for v6 in Next.js/webpack) ───────
// Direct path: same-origin, MapLibre creates a module worker (type:'module') that
// resolves ./maplibre-gl-shared.mjs relative to its own URL. Both files are served
// from /public with application/javascript MIME, verified working.
setWorkerUrl('https://unpkg.com/maplibre-gl@6.1.0/dist/maplibre-gl-worker.mjs')


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
const multFor = (time: number) => (FORECAST_CONF[time] || FORECAST_CONF[0]).mult

// ─── Tile / style configuration ────────────────────────────────────────────
const VOYAGER_TILES = [
  'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
]
const DARK_TILES = [
  'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
]
const TERRAIN_TILES = ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain</a>'

function buildBaseStyle(dark: boolean): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      base: {
        type: 'raster',
        tiles: dark ? DARK_TILES : VOYAGER_TILES,
        tileSize: 256,
        attribution: ATTRIBUTION,
      },
      terrain: {
        type: 'raster-dem',
        tiles: TERRAIN_TILES,
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 15,
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#e5e7eb' } },
      { id: 'base-layer', type: 'raster', source: 'base' },
    ],
  }
}

// ─── GeoJSON helpers ────────────────────────────────────────────────────────
type Feature = GeoJSON.Feature
const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] }
function lineFeature(coords: [number, number][], props: Record<string, unknown>): Feature {
  return { type: 'Feature' as const, properties: props, geometry: { type: 'LineString' as const, coordinates: coords } }
}
function pointFeature(coords: [number, number], props: Record<string, unknown>): Feature {
  return { type: 'Feature' as const, properties: props, geometry: { type: 'Point' as const, coordinates: coords } }
}

// ─── Marker HTML builders ───────────────────────────────────────────────────
const cctvIconHTML = () =>
  `<div style="background:#1e293b;border:2px solid white;border-radius:6px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.4);pointer-events:auto">${renderToString(<Video size={14} color="white" />)}</div>`
const trafficLightIconHTML = (phase: 'green' | 'yellow' | 'red') => {
  const c = phase === 'green' ? '#22c55e' : phase === 'yellow' ? '#eab308' : '#ef4444'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="${c}" stroke="${c}"/></svg>`
  return `<div style="background:#111827;border:2px solid ${c};border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px ${c}88;pointer-events:auto">${svg}</div>`
}
const eventIconHTML = () =>
  `<div style="background:#7c3aed;border:2px solid white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);pointer-events:auto">${renderToString(<CalendarDays size={12} color="white" />)}</div>`
const crowdIconHTML = () =>
  `<div style="background:#dc2626;border:2px solid white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);pointer-events:auto">${renderToString(<AlertTriangle size={12} color="white" />)}</div>`
const ambulanceIconHTML = (green: boolean) =>
  `<div style="background:${green ? '#16a34a' : '#dc2626'};border:2.5px solid white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px ${green ? '#22c55e88' : '#ef444488'};pointer-events:auto">${renderToString(<AmbulanceIcon size={18} color="white" />)}</div>`

// ─── Popup HTML builders ────────────────────────────────────────────────────
function nodePopupHTML(node: TrafficNode, level: number, tab: string, forecastTime: number): string {
  const conf = FORECAST_CONF[forecastTime] || FORECAST_CONF[0]
  const label = tab === 'live' ? 'Status Live' : tab === 'prediction' ? `Prediksi ${conf.label}` : 'Mode Simulasi'
  const confPct = Math.round(node.confidence * 100)
  const buttons = tab === 'live'
    ? node.recommendation
      ? `<button data-action="approve" style="flex:1;padding:8px 0;border:none;cursor:pointer;border-radius:10px;font-size:12px;font-weight:900;background:#facc15;color:#111827">✓ Approve AI</button>`
      : `<button data-action="detail" style="flex:1;padding:8px 0;border:none;cursor:pointer;border-radius:10px;font-size:12px;font-weight:700;background:rgba(255,255,255,0.1);color:white">Detail</button>`
    : `<button data-action="sim" style="flex:1;padding:8px 0;border:none;cursor:pointer;border-radius:10px;font-size:12px;font-weight:700;background:rgba(255,255,255,0.1);color:white">${tab === 'prediction' ? '📊 Analisis Detail' : '🔮 Buka Simulasi'}</button>`
  return `
    <div class="text-white" style="font-family:inherit;min-width:250px">
      <div class="flex justify-between items-center p-4 pb-3 border-b" style="border-color:rgba(255,255,255,0.1)">
        <div>
          <h3 style="font-weight:900;font-size:14px;margin:0">${node.name}</h3>
          <p style="font-size:9px;color:rgba(255,255,255,0.5);text-transform:uppercase;font-weight:800;letter-spacing:0.12em;margin:3px 0 0">${label}</p>
        </div>
      </div>
      <div class="p-4" style="display:flex;flex-direction:column;gap:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div style="background:rgba(255,255,255,0.1);border-radius:12px;padding:10px;text-align:center">
            <p style="font-size:9px;color:rgba(255,255,255,0.5);text-transform:uppercase;font-weight:800;margin:0 0 2px">Live Skrg</p>
            <p style="font-size:18px;font-weight:900;margin:0;color:${getColor(node.currentLevel)}">${node.currentLevel}%</p>
          </div>
          <div style="background:rgba(255,255,255,0.1);border-radius:12px;padding:10px;text-align:center">
            <p style="font-size:9px;color:rgba(255,255,255,0.5);text-transform:uppercase;font-weight:800;margin:0 0 2px">${tab === 'live' ? 'Pred 30m' : tab === 'prediction' ? conf.label : '+25% Vol'}</p>
            <p style="font-size:18px;font-weight:900;margin:0;color:${getColor(Math.round(level))}">${Math.round(level)}%</p>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;font-size:12px">
          <span style="color:rgba(255,255,255,0.6)">Confidence</span>
          <span style="font-weight:900;color:#4ade80">${confPct}%</span>
        </div>
        ${node.recommendation ? `<div style="background:#17153b;border:1px solid #2d2a5d;border-radius:10px;padding:10px"><p style="font-size:9px;color:rgba(255,255,255,0.5);text-transform:uppercase;font-weight:800;letter-spacing:0.1em;margin:0 0 4px">AI</p><p style="font-size:12px;color:#facc15;font-weight:700;margin:0">${node.recommendation}</p></div>` : ''}
        <div style="display:flex;gap:8px">${buttons}</div>
      </div>
    </div>`
}
function vehiclePopupHTML(v: EmergencyVehicle): string {
  return `
    <div class="text-white" style="font-family:inherit;min-width:250px">
      <div class="flex justify-between items-center p-4 pb-3 border-b" style="border-color:rgba(255,255,255,0.1)">
        <div>
          <h3 style="font-weight:900;font-size:14px;margin:0">${v.label}</h3>
          <p style="font-size:9px;color:rgba(255,255,255,0.5);text-transform:uppercase;font-weight:800;letter-spacing:0.12em;margin:3px 0 0">VANGUARD UNIT</p>
        </div>
      </div>
      <div class="p-4" style="display:flex;flex-direction:column;gap:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">
          <div style="background:rgba(255,255,255,0.1);border-radius:10px;padding:8px">
            <p style="font-size:9px;color:rgba(255,255,255,0.5);font-weight:800;margin:0 0 2px">ETA</p>
            <p style="font-size:14px;font-weight:900;margin:0">${v.etaMinutes.toFixed(0)}m</p>
          </div>
          <div style="background:rgba(255,255,255,0.1);border-radius:10px;padding:8px">
            <p style="font-size:9px;color:rgba(255,255,255,0.5);font-weight:800;margin:0 0 2px">JARAK</p>
            <p style="font-size:14px;font-weight:900;margin:0">${v.distanceKm}km</p>
          </div>
          <div style="background:${v.greenWaveOn ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'};border-radius:10px;padding:8px">
            <p style="font-size:9px;color:rgba(255,255,255,0.5);font-weight:800;margin:0 0 2px">GREEN</p>
            <p style="font-size:14px;font-weight:900;margin:0;color:${v.greenWaveOn ? '#4ade80' : 'rgba(255,255,255,0.4)'}">${v.greenWaveOn ? 'ON' : 'OFF'}</p>
          </div>
        </div>
        <div style="background:rgba(255,255,255,0.1);border-radius:9999px;height:8px;overflow:hidden">
          <div style="height:100%;border-radius:9999px;background:#4ade80;width:${(v.progress * 100).toFixed(0)}%"></div>
        </div>
        <p style="font-size:10px;color:rgba(255,255,255,0.6);margin:0;text-align:right;font-weight:700">${(v.progress * 100).toFixed(0)}% perjalanan</p>
      </div>
    </div>`
}
function cctvPopupHTML(node: TrafficNode, i: number): string {
  return `<div class="text-white p-3" style="font-family:inherit"><p style="font-weight:700;font-size:14px;margin:0">CCTV SITS-${String(i + 1).padStart(4, '0')}</p><p style="font-size:12px;color:rgba(255,255,255,0.6);margin:4px 0 0">${node.name}</p><p style="font-size:12px;color:#4ade80;font-weight:700;margin:4px 0 0">● Online</p></div>`
}
function lightPopupHTML(node: TrafficNode, phase: string): string {
  const c = phase === 'green' ? '#4ade80' : phase === 'yellow' ? '#facc15' : '#f87171'
  return `<div class="text-white p-3" style="font-family:inherit"><p style="font-weight:700;font-size:14px;margin:0">${node.name}</p><p style="font-size:12px;font-weight:900;margin:6px 0 0;color:${c}">Fase: ${phase.toUpperCase()}</p><p style="font-size:12px;color:rgba(255,255,255,0.6);margin:4px 0 0">Durasi Hijau: ${phase === 'green' ? '45s' : '30s'}</p></div>`
}
function crowdPopupHTML(node: TrafficNode): string {
  return `<div class="text-white p-3" style="font-family:inherit"><p style="font-weight:700;font-size:14px;margin:0">Laporan Masyarakat</p><p style="font-size:12px;color:rgba(255,255,255,0.6);margin:4px 0 0">${node.name}</p><p style="font-size:12px;color:#f87171;font-weight:700;margin:4px 0 0">Kemacetan parah dilaporkan</p></div>`
}
function eventPopupHTML(node: TrafficNode): string {
  return `<div class="text-white p-3" style="font-family:inherit"><p style="font-weight:700;font-size:14px;margin:0">Event Aktif</p><p style="font-size:12px;color:rgba(255,255,255,0.6);margin:4px 0 0">Sekitar ${node.name}</p><p style="font-size:12px;color:#c4b5fd;font-weight:700;margin:4px 0 0">Potensi peningkatan volume</p></div>`
}

// ─── Sub-panels (rendered as absolute overlays on the map) ─────────────────

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
          {times.map((t) => (
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
export default function DigitalTwinMapInner({ nodes, vehicles, activeTab, onNodeSelect, onApprove, initialOverlays }: MapInnerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Map<string, Marker>>(new Map())
  const popupRef = useRef<Popup | null>(null)
  const nodesRef = useRef(nodes)
  useEffect(() => { nodesRef.current = nodes })
  const [mapReady, setMapReady] = useState(false)
  const [is3D, setIs3D] = useState(false)

  const [overlays, setOverlays] = useState<OverlayState>({
    cctv: false, lights: false, vehicles: true, crowd: false, events: false,
    ...initialOverlays,
  })
  const [forecastTime, setForecastTime] = useState(0)
  const [displayLevels, setDisplayLevels] = useState<Record<string, number>>({})
  const [selectedNode, setSelectedNode] = useState<TrafficNode | null>(null)
  const [roadSegments, setRoadSegments] = useState<RoadSegment[]>([])
  const [vehicleRoutes, setVehicleRoutes] = useState<VehicleRoute[]>([])
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevTabRef = useRef(activeTab)
  const routeCacheRef = useRef<Map<string, VehicleRoute>>(new Map())


  // Initialise display levels lazily via the forecast animation effect below

  // Load OSRM vehicle routes when vehicles change
  useEffect(() => {
    if (vehicles.length === 0) return

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

  const getNodeDisplayLevel = useCallback((node: TrafficNode): number => {
    if (activeTab === 'live') return node.currentLevel
    if (activeTab === 'prediction') return displayLevels[node.id] ?? node.currentLevel
    if (activeTab === 'simulation') return Math.min(100, node.currentLevel * 1.25)
    return node.currentLevel
  }, [activeTab, displayLevels])

  const loadRoadSegments = useCallback(async function (nodeList: TrafficNode[]) {
    if (nodeList.length <= 1) {
      setRoadSegments([])
      return
    }
    const segments: RoadSegment[] = []
    const cache = new Map<string, RoadSegment>()

    const processSegment = async (i: number, j: number): Promise<RoadSegment | null> => {
      if (!nodeList[i] || !nodeList[j]) return null

      const fromId = `${nodeList[i].lat},${nodeList[i].lng}`
      const toId = `${nodeList[j].lat},${nodeList[j].lng}`
      const cacheKey = `${fromId}|${toId}`

      if (cache.has(cacheKey)) {
        return cache.get(cacheKey)!
      }

      try {
        const route = await osrm.getRoute(
          [nodeList[i].lat, nodeList[i].lng],
          [nodeList[j].lat, nodeList[j].lng]
        )

        if (route) {
          const segment: RoadSegment = {
            id: `route-${i}-${j}`,
            fromNode: nodeList[i],
            toNode: nodeList[j],
            geometry: route.geometry,
            avgLevel: (nodeList[i].currentLevel + nodeList[j].currentLevel) / 2
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

    try {
      const processedRoutes = await Promise.all(
        ROAD_CONNECTIONS.map(async ([i, j]) => {
          if (i >= nodeList.length || j >= nodeList.length) return null
          const existing = cache.get(
            `${nodeList[i].lat},${nodeList[i].lng}|${nodeList[j].lat},${nodeList[j].lng}`
          )
          if (existing) return existing
          return await processSegment(i, j)
        })
      )

      setRoadSegments(processedRoutes.filter((r): r is RoadSegment => r !== null))
    } catch (error) {
      console.error('Failed to load road segments:', error)
      setRoadSegments([])
    }
  }, [])

  // Load OSRM road segments when nodes change
  useEffect(() => {
    if (nodes.length <= 1) return
    const t = setTimeout(() => loadRoadSegments(nodes), 0)
    return () => clearTimeout(t)
  }, [nodes, loadRoadSegments])

  // When tab changes, reset selection
  useEffect(() => {
    if (activeTab !== prevTabRef.current) {
      setSelectedNode(null)
      setForecastTime(0)
      prevTabRef.current = activeTab
    }
  }, [activeTab])

  // Traffic light phases derived from congestion level (mock)
  const getLightPhase = useCallback((level: number): 'green' | 'yellow' | 'red' => {
    if (level < 40) return 'green'
    if (level < 65) return 'yellow'
    return 'red'
  }, [])

  // Animated transition when forecast time changes
  useEffect(() => {
    if (animRef.current) clearInterval(animRef.current)
    const mult = multFor(forecastTime)
    const targets: Record<string, number> = {}
    nodesRef.current.forEach(n => { targets[n.id] = Math.min(100, n.currentLevel * mult) })

    let steps = 0
    const maxSteps = 8
    animRef.current = setInterval(() => {
      setDisplayLevels(prev => {
        const next = { ...prev }
        nodesRef.current.forEach(n => {
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

  // Latest handlers for map event callbacks
  const latestRef = useRef({ nodes, activeTab, onNodeSelect, onApprove, forecastTime, getNodeDisplayLevel, setSelectedNode })
  useEffect(() => {
    latestRef.current = { nodes, activeTab, onNodeSelect, onApprove, forecastTime, getNodeDisplayLevel, setSelectedNode }
  }, [nodes, activeTab, onNodeSelect, onApprove, forecastTime, getNodeDisplayLevel, setSelectedNode])

  const openNodePopup = (node: TrafficNode, lngLat: [number, number]) => {
    const map = mapRef.current
    if (!map) return
    const { activeTab: tab, forecastTime, onApprove, onNodeSelect } = latestRef.current
    const level = latestRef.current.getNodeDisplayLevel(node)

    popupRef.current?.remove()
    const el = document.createElement('div')
    el.innerHTML = nodePopupHTML(node, level, tab, forecastTime)

    el.querySelector('[data-action="approve"]')?.addEventListener('click', () => {
      if (onApprove) onApprove(node.id, 'approve')
      popupRef.current?.remove()
    })
    el.querySelector('[data-action="detail"]')?.addEventListener('click', () => {
      if (tab === 'live') onNodeSelect(node)
      else latestRef.current.setSelectedNode(node)
      popupRef.current?.remove()
    })
    el.querySelector('[data-action="sim"]')?.addEventListener('click', () => {
      latestRef.current.setSelectedNode(node)
      popupRef.current?.remove()
    })

    popupRef.current = new Popup({ offset: 24, closeButton: false, maxWidth: '320px' })
      .setLngLat(lngLat)
      .setDOMContent(el)
      .addTo(map)
  }

  // ─── Map initialization ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    console.log('[DigitalTwinMap] INIT STARTED', containerRef.current.getBoundingClientRect())
    const map = new MapLibreMap({
      container: containerRef.current,
      center: [112.74, -7.28],
      zoom: 12.5,
      pitch: 60,
      bearing: -20,
      maxPitch: 85,
      minZoom: 3,
      style: buildBaseStyle(false),
    })
    mapRef.current = map
    map.addControl(new NavigationControl({ visualizePitch: true, showCompass: true }), 'bottom-left')

    // Force trigger resize to ensure MapLibre adapts to container's client bounds
    setTimeout(() => {
      map.resize()
    }, 100)

    map.on('load', () => {
      console.log('[DigitalTwinMap] MAP LOADED')
      map.resize()
      const style = map.getStyle()
      console.log('[DigitalTwinMap] STYLE', style)
      console.log('[DigitalTwinMap] SOURCES', Object.keys(style.sources || {}))
      console.log('[DigitalTwinMap] LAYERS', style.layers?.map(l => l.id))
      console.log('[DigitalTwinMap] CONTAINER SIZE', containerRef.current?.getBoundingClientRect())

      map.on('idle', () => {
        console.log('[DigitalTwinMap] MAP IDLE - render complete')
      })
      map.on('render', () => {
        console.log('[DigitalTwinMap] MAP RENDER')
      })
      map.on('sourcedata', (e) => {
        console.log('[DigitalTwinMap] SOURCE DATA', e.sourceId, e.isSourceLoaded)
      })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ; (map as any).on('tileerror', (e: any) => {
          console.error('[DigitalTwinMap] TILE ERROR', e)
        })

      if (!map.getSource('segments')) map.addSource('segments', { type: 'geojson', data: EMPTY_FC })
      if (!map.getSource('nodes')) map.addSource('nodes', { type: 'geojson', data: EMPTY_FC })
      if (!map.getSource('vehicle-routes')) map.addSource('vehicle-routes', { type: 'geojson', data: EMPTY_FC })
      if (!map.getSource('openmaptiles')) {
        map.addSource('openmaptiles', {
          type: 'vector',
          url: 'https://tiles.openfreemap.org/planet'
        })
      }

      console.log('[DigitalTwinMap] BASE SOURCE', map.getSource('base'))
      console.log('[DigitalTwinMap] BASE LAYER', map.getLayer('base-layer'))

      if (!map.getLayer('3d-buildings')) {
        map.addLayer({
          id: '3d-buildings',
          type: 'fill-extrusion',
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'render_height'], 8],
              0, '#e5e7eb',
              20, '#d1d5db',
              50, '#9ca3af',
              100, '#4b5563'
            ],
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.85
          }
        })
      }

      if (!map.getLayer('segments-layer')) {
        map.addLayer({
          id: 'segments-layer', type: 'line', source: 'segments',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['get', 'width'],
            'line-opacity': 0.6,
            'line-dasharray': ['get', 'dash'],
          },
        })
      }
      if (!map.getLayer('veh-bg')) {
        map.addLayer({
          id: 'veh-bg', type: 'line', source: 'vehicle-routes',
          filter: ['==', ['get', 'kind'], 'bg'],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#475569', 'line-width': 2, 'line-opacity': 0.35, 'line-dasharray': [6, 5] },
        })
      }
      if (!map.getLayer('veh-done')) {
        map.addLayer({
          id: 'veh-done', type: 'line', source: 'vehicle-routes',
          filter: ['==', ['get', 'kind'], 'done'],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.85 },
        })
      }
      if (!map.getLayer('veh-rem')) {
        map.addLayer({
          id: 'veh-rem', type: 'line', source: 'vehicle-routes',
          filter: ['==', ['get', 'kind'], 'rem'],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#ef4444', 'line-width': 4, 'line-opacity': 0.55, 'line-dasharray': [5, 4] },
        })
      }
      if (!map.getLayer('veh-origin')) {
        map.addLayer({
          id: 'veh-origin', type: 'circle', source: 'vehicle-routes',
          filter: ['==', ['get', 'kind'], 'origin'],
          paint: { 'circle-color': '#3b82f6', 'circle-radius': 5, 'circle-stroke-color': '#1e293b', 'circle-stroke-width': 2 },
        })
      }
      if (!map.getLayer('veh-dest')) {
        map.addLayer({
          id: 'veh-dest', type: 'circle', source: 'vehicle-routes',
          filter: ['==', ['get', 'kind'], 'dest'],
          paint: { 'circle-color': '#ef4444', 'circle-radius': 7, 'circle-opacity': 0.25, 'circle-stroke-color': '#ef4444', 'circle-stroke-width': 3 },
        })
      }
      if (!map.getLayer('nodes-layer')) {
        map.addLayer({
          id: 'nodes-layer', type: 'circle', source: 'nodes',
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': ['get', 'radius'],
            'circle-stroke-color': ['get', 'stroke'],
            'circle-stroke-width': ['get', 'strokeWidth'],
            'circle-opacity': 0.85,
            'circle-stroke-opacity': 1,
          },
        })
      }
      if (!map.getLayer('badges-layer')) {
        map.addLayer({
          id: 'badges-layer', type: 'symbol', source: 'nodes',
          filter: ['get', 'showBadge'],
          layout: {
            'text-field': ['concat', '⚠ +', ['to-string', ['get', 'time']], 'm: ', ['to-string', ['get', 'level']], '%'],
            'text-size': 10,
            'text-font': ['Open Sans Bold'],
            'text-offset': [0, -1.6],
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#1e1b4b',
            'text-halo-width': 1.4,
          },
        })
      }

      map.setTerrain({ source: 'terrain', exaggeration: 1.3 })

      map.on('click', 'nodes-layer', (e: MapLayerMouseEvent) => {
        const f = e.features?.[0]
        if (!f) return
        const node = latestRef.current.nodes.find(n => n.id === f.properties?.id)
        if (!node) return
        const { activeTab: tab, onApprove, onNodeSelect } = latestRef.current
        if (tab === 'live') {
          if (onApprove && node.recommendation) onApprove(node.id, 'approve')
          else onNodeSelect(node)
        } else {
          latestRef.current.setSelectedNode(prev => prev?.id === node.id ? null : node)
        }
        const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat]
        openNodePopup(node, lngLat)
      })
      map.on('mousemove', 'nodes-layer', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'nodes-layer', () => { map.getCanvas().style.cursor = '' })

      setMapReady(true)
    })

    map.on('error', (e) => {
      console.error('[DigitalTwinMap] MAP ERROR', e)
    })

    const markers = markersRef.current
    return () => {
      markers.forEach(m => m.remove())
      markers.clear()
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [])

  const toggle3D = () => {
    const map = mapRef.current
    if (!map) return
    if (is3D) {
      map.easeTo({ pitch: 0, bearing: 0 })
      map.setTerrain(null)
    } else {
      map.easeTo({ pitch: 60, bearing: -20 })
      map.setTerrain({ source: 'terrain', exaggeration: 1.3 })
    }
    setIs3D(!is3D)
  }

  // ─── Data updates ────────────────────────────────────────────────────────
  // Road segments source
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const source = map.getSource('segments')
    if (!source) return

    const features: Feature[] = []
    const mult = multFor(forecastTime)
    if (roadSegments.length > 0) {
      roadSegments.forEach(s => {
        const pred = activeTab === 'prediction' ? Math.min(100, s.avgLevel * mult) : s.avgLevel
        features.push(lineFeature(
          s.geometry.map(([la, ln]): [number, number] => [ln, la]),
          { color: getColor(pred), width: activeTab === 'simulation' ? 5 : 4, dash: [1, 0] }
        ))
      })
    } else {
      ROAD_CONNECTIONS.forEach(([i, j]) => {
        if (!nodes[i] || !nodes[j]) return
        const avg = (getNodeDisplayLevel(nodes[i]) + getNodeDisplayLevel(nodes[j])) / 2
        const pred = activeTab === 'prediction' ? Math.min(100, avg * mult) : avg
        features.push(lineFeature(
          [[nodes[i].lng, nodes[i].lat], [nodes[j].lng, nodes[j].lat]],
          { color: getColor(pred), width: 4, dash: [5, 3] }
        ))
      })
    }
    ; (source as GeoJSONSource).setData({ type: 'FeatureCollection', features })
  }, [roadSegments, nodes, activeTab, forecastTime, displayLevels, mapReady, getNodeDisplayLevel])

  // Node markers source
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const source = map.getSource('nodes')
    if (!source) return

    const features = nodes.map(n => {
      const level = getNodeDisplayLevel(n)
      const isSelected = selectedNode?.id === n.id
      const isPredWorse = activeTab === 'prediction' && level > n.currentLevel + 10
      return pointFeature([n.lng, n.lat], {
        id: n.id,
        name: n.name,
        level: Math.round(level),
        time: forecastTime,
        showBadge: activeTab === 'prediction' && forecastTime !== 0 && level >= 70,
        color: getColor(level),
        stroke: isSelected ? '#ffffff' : getDarkerColor(level),
        radius: isSelected ? 20 : isPredWorse ? 17 : 13,
        strokeWidth: isSelected ? 4 : 2.5,
        dash: activeTab === 'prediction' && isPredWorse ? [3, 2] : [1, 0],
      })
    })
      ; (source as GeoJSONSource).setData({ type: 'FeatureCollection', features })
  }, [nodes, displayLevels, selectedNode, activeTab, forecastTime, mapReady, getNodeDisplayLevel])

  // Vehicle routes source
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const source = map.getSource('vehicle-routes')
    if (!source) return

    const features: Feature[] = []
    vehicles.forEach(v => {
      const route = vehicleRoutes.find(r => r.vehicleId === v.id)
      const geo = route?.geometry ?? [[v.originLat, v.originLng], [v.destLat, v.destLng]] as [number, number][]
      const coords = geo.map(([la, ln]): [number, number] => [ln, la])
      const doneIdx = Math.max(1, Math.floor(coords.length * v.progress))
      features.push(lineFeature(coords, { kind: 'bg' }))
      if (doneIdx >= 2) features.push(lineFeature(coords.slice(0, doneIdx), { kind: 'done', color: v.greenWaveOn ? '#22c55e' : '#3b82f6' }))
      if (coords.length >= 2) features.push(lineFeature(coords.slice(doneIdx - 1), { kind: 'rem' }))
      features.push(pointFeature([v.originLng, v.originLat], { kind: 'origin' }))
      features.push(pointFeature([v.destLng, v.destLat], { kind: 'dest' }))
    })
      ; (source as GeoJSONSource).setData({ type: 'FeatureCollection', features })
  }, [vehicles, vehicleRoutes, mapReady])

  // Vehicle layer visibility
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const visible = activeTab === 'live' ? overlays.vehicles : true
      ;['veh-bg', 'veh-done', 'veh-rem', 'veh-origin', 'veh-dest'].forEach(id => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
      })
  }, [overlays.vehicles, activeTab, mapReady])

  // Vehicle HTML markers
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const visible = activeTab === 'live' ? overlays.vehicles : true
    if (!visible) return

    const liveKeys = new Set<string>()
    vehicles.forEach(v => {
      const key = `veh-${v.id}`
      liveKeys.add(key)
      const pos = interpolatePos(v.originLat, v.originLng, v.destLat, v.destLng, v.progress)
      const existing = markersRef.current.get(key)
      if (existing) {
        existing.getElement().innerHTML = ambulanceIconHTML(v.greenWaveOn)
        existing.setLngLat([pos[1], pos[0]])
      } else {
        const el = document.createElement('div')
        el.innerHTML = ambulanceIconHTML(v.greenWaveOn)
        const marker = new Marker({ element: el })
          .setLngLat([pos[1], pos[0]])
          .setPopup(new Popup({ offset: 28, closeButton: false, maxWidth: '320px' }).setHTML(vehiclePopupHTML(v)))
          .addTo(map)
        markersRef.current.set(key, marker)
      }
    })

    markersRef.current.forEach((m, k) => {
      if (k.startsWith('veh-') && !liveKeys.has(k)) {
        m.remove()
        markersRef.current.delete(k)
      }
    })
  }, [vehicles, overlays.vehicles, activeTab, mapReady])

  // Overlay markers (CCTV / lights / crowd / events)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    if (activeTab !== 'live') {
      markersRef.current.forEach((m, k) => {
        if (k.startsWith('ov-')) { m.remove(); markersRef.current.delete(k) }
      })
      return
    }

    const wanted = new Set<string>()
    const upsert = (key: string, html: string, lngLat: [number, number], popupHTML?: string) => {
      wanted.add(key)
      const existing = markersRef.current.get(key)
      if (existing) {
        existing.getElement().innerHTML = html
        existing.setLngLat(lngLat)
      } else {
        const el = document.createElement('div')
        el.innerHTML = html
        const marker = new Marker({ element: el }).setLngLat(lngLat)
        if (popupHTML) marker.setPopup(new Popup({ offset: 20, closeButton: false, maxWidth: '300px' }).setHTML(popupHTML))
        marker.addTo(map)
        markersRef.current.set(key, marker)
      }
    }

    if (overlays.cctv) {
      nodes.forEach((n, i) => upsert(
        `ov-cctv-${n.id}`, cctvIconHTML(), [n.lng - 0.0015, n.lat + 0.0015], cctvPopupHTML(n, i)
      ))
    }
    if (overlays.lights) {
      nodes.forEach(n => upsert(
        `ov-light-${n.id}`, trafficLightIconHTML(getLightPhase(n.currentLevel)), [n.lng + 0.001, n.lat - 0.001], lightPopupHTML(n, getLightPhase(n.currentLevel))
      ))
    }
    if (overlays.crowd) {
      nodes.filter(n => n.currentLevel > 60).forEach(n => upsert(
        `ov-crowd-${n.id}`, crowdIconHTML(), [n.lng + 0.002, n.lat + 0.001], crowdPopupHTML(n)
      ))
    }
    if (overlays.events) {
      nodes.slice(0, 2).forEach(n => upsert(
        `ov-event-${n.id}`, eventIconHTML(), [n.lng - 0.001, n.lat - 0.002], eventPopupHTML(n)
      ))
    }

    markersRef.current.forEach((m, k) => {
      if (k.startsWith('ov-') && !wanted.has(k)) {
        m.remove()
        markersRef.current.delete(k)
      }
    })
  }, [overlays, nodes, activeTab, mapReady, getLightPhase])

  // Tile theme switch
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const source = map.getSource('base')
    if (source && 'setTiles' in source) {
      ; (source as RasterTileSource).setTiles(activeTab === 'simulation' ? DARK_TILES : VOYAGER_TILES)
    }
  }, [activeTab, mapReady])

  return (
    <div className="relative w-full h-full min-h-[500px]">
      <style>{`
        .maplibregl-popup-content {
          background: #1e1b4b !important;
          color: white !important;
          border-radius: 14px !important;
          padding: 0 !important;
          overflow: hidden !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
        }
        .maplibregl-popup-tip {
          border-top-color: #1e1b4b !important;
        }
        .maplibregl-popup-close-button { display: none !important; }
        .maplibregl-map .maplibregl-canvas-container.maplibregl-interactive,
        .maplibregl-map.maplibregl-interactive {
          cursor: grab;
        }
        .maplibregl-map.maplibregl-touch-zoom-rotate,
        .maplibregl-map.maplibregl-touch-drag-pan { touch-action: pan-x pan-y; }
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

      {/* 3D / 2D toggle */}
      <button
        onClick={toggle3D}
        className="absolute bottom-4 right-4 z-[900] px-3 py-2 rounded-xl bg-white/95 backdrop-blur-sm border border-slate-200 shadow-lg text-xs font-black text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
        title={is3D ? 'Kembali ke tampilan 2D' : 'Aktifkan tampilan 3D'}
      >
        <span className={`w-2 h-2 rounded-full ${is3D ? 'bg-blue-600' : 'bg-slate-300'}`} />
        {is3D ? '3D ON' : '3D OFF'}
      </button>

      {/* MapLibre GL map — single ref, must be the only element with containerRef */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
    </div>
  )
}
