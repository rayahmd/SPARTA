'use client'
import { useMemo, useState, useSyncExternalStore } from 'react'
import useSWR from 'swr'
import { Ambulance, Brain } from 'lucide-react'
import { DigitalTwinMap } from '@/components/dashboard/DigitalTwinMap'
import { AiRecommendationPanel } from '@/components/dashboard/AiRecommendationPanel'
import { VanguardPanel } from '@/components/dashboard/VanguardPanel'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SHOW_PREDICTION_UI } from '@/lib/config/features'

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

interface Incident {
  id: string
  type: string
  description: string
  status: string
}

// Panel floating di atas peta
const PANEL_WIDTH = 380
const GLASS = 'border border-white/70 bg-white/85 shadow-lg backdrop-blur-md'
const PANEL_CLASS = `pointer-events-auto h-auto max-h-full rounded-2xl ${GLASS}`
const CHIP_CLASS = `pointer-events-auto inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-[#111827] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8F1610] ${GLASS}`

// Di layar sempit (<1024px) panel default tertutup supaya peta tidak tertutup.
const NARROW_QUERY = '(max-width: 1023px)'
function subscribeNarrow(onChange: () => void) {
  const media = window.matchMedia(NARROW_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const getNarrow = () => window.matchMedia(NARROW_QUERY).matches
const getNarrowOnServer = () => false

export default function EphorDashboard() {
  const [selectedNode, setSelectedNode] = useState<TrafficNode | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'live' | 'prediction'>('live')
  // null = ikuti default (terbuka di layar lebar, tertutup di layar sempit)
  const [aiOpenPref, setAiOpenPref] = useState<boolean | null>(null)
  const [vanguardOpenPref, setVanguardOpenPref] = useState<boolean | null>(null)
  const isNarrow = useSyncExternalStore(subscribeNarrow, getNarrow, getNarrowOnServer)
  const aiOpen = aiOpenPref ?? !isNarrow
  const vanguardOpen = vanguardOpenPref ?? !isNarrow

  const { data: nodes = [], mutate: mutateNodes } = useSWR<TrafficNode[]>(
    '/api/traffic-nodes', fetcher, { refreshInterval: 5000 }
  )
  const { data: vehicles = [], mutate: mutateVehicles } = useSWR<EmergencyVehicle[]>(
    '/api/vanguard', fetcher, { refreshInterval: 5000 }
  )
  const { data: incidents = [] } = useSWR<Incident[]>(
    '/api/incidents', fetcher, { refreshInterval: 5000 }
  )

  // KPI calculations
  const avgLevel = nodes.length > 0 
    ? Math.round(nodes.reduce((sum, n) => sum + n.currentLevel, 0) / nodes.length) 
    : 0
  const avgPredicted = nodes.length > 0 
    ? Math.round(nodes.reduce((sum, n) => sum + n.predicted30, 0) / nodes.length) 
    : 0
  const avgConfidence = nodes.length > 0 
    ? (nodes.reduce((sum, n) => sum + n.confidence, 0) / nodes.length * 100).toFixed(1) 
    : '0'

  const handleNodeSelect = (node: TrafficNode) => {
    setSelectedNode(node)
    setDialogOpen(true)
  }

  const handleApprove = async (id: string, action: string) => {
    await fetch(`/api/traffic-nodes/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    })
    mutateNodes()
  }

  const handleTriggerVanguard = async () => {
    await fetch('/api/vanguard/trigger', { method: 'POST' })
    mutateVehicles()
  }

  const tabBadge = {
    live: { label: 'LIVE', className: 'border-[#16A34A] text-[#16A34A] bg-green-50' },
    prediction: { label: 'PREDIKSI +30M', className: 'border-[#2563EB] text-[#2563EB] bg-blue-50' },
  }

  // Selama UI Prediction disembunyikan, peta selalu mode Live.
  const mapTab = SHOW_PREDICTION_UI ? activeTab : 'live'
  const recommendationCount = nodes.filter(n => n.recommendation).length

  // Area yang tertutup panel floating; pin yang diklik digeser ke luar area ini.
  const focusPadding = useMemo(() => ({
    top: 240,
    bottom: 48,
    left: isNarrow ? 16 : 150,
    right: !isNarrow && (aiOpen || vanguardOpen) ? PANEL_WIDTH + 28 : 16,
  }), [isNarrow, aiOpen, vanguardOpen])

  const headerPill = (
    <div className={`flex max-w-full items-center gap-2.5 rounded-full py-1.5 pl-4 pr-2 ${GLASS}`}>
      <h2 className="truncate text-sm font-bold text-[#111827]">Live Map Surabaya</h2>
      <Badge variant="outline" className={`text-xs font-bold uppercase ${tabBadge[mapTab].className}`}>
        <span className="w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse bg-current" />
        {tabBadge[mapTab].label}
      </Badge>
      {SHOW_PREDICTION_UI && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-auto">
          <TabsList className="h-10 bg-[#f3f4f6] rounded-lg">
            <TabsTrigger value="live" className="text-xs px-4 h-8 font-semibold data-[state=active]:bg-[#8F1610] data-[state=active]:text-white">Live</TabsTrigger>
            <TabsTrigger value="prediction" className="text-xs px-4 h-8 font-semibold data-[state=active]:bg-[#2563EB] data-[state=active]:text-white">Prediction</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
    </div>
  )

  return (
    // Peta mengisi seluruh area konten di sebelah sidebar; `isolate` menjaga
    // modal (z-50, di body) tetap di atas peta dan panel-panelnya.
    <div className="relative isolate -m-6 h-screen overflow-hidden">
      <DigitalTwinMap
        nodes={nodes}
        vehicles={vehicles}
        activeTab={mapTab}
        onNodeSelect={handleNodeSelect}
        onApprove={handleApprove}
        topLeftSlot={headerPill}
        focusPadding={focusPadding}
      />

      {/* Panel floating. Container tidak menangkap pointer supaya peta tetap bisa
          digeser di sela-sela panel; bagian bawah dikosongkan untuk atribusi peta. */}
      <div
        className="pointer-events-none absolute bottom-12 right-3 top-3 z-[850] flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-3"
        style={{ width: PANEL_WIDTH }}
      >
        {aiOpen ? (
          <div className="flex min-h-0 w-full flex-1 flex-col">
            <AiRecommendationPanel
              nodes={nodes}
              onApprove={handleApprove}
              onMinimizeToggle={() => setAiOpenPref(false)}
              className={PANEL_CLASS}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAiOpenPref(true)}
            aria-expanded={false}
            aria-label={`Buka panel AI Recommendation, ${recommendationCount} rekomendasi`}
            className={CHIP_CLASS}
          >
            <Brain size={14} className="text-[#8F1610]" />
            <span className="hidden sm:inline">AI Recommendation</span>
            {recommendationCount > 0 && (
              <span className="text-[10px] font-semibold bg-red-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                {recommendationCount}
              </span>
            )}
          </button>
        )}

        {vanguardOpen ? (
          <div className="flex max-h-[45%] w-full shrink-0 flex-col">
            <VanguardPanel
              vehicles={vehicles}
              onTrigger={handleTriggerVanguard}
              onMinimizeToggle={() => setVanguardOpenPref(false)}
              className={PANEL_CLASS}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setVanguardOpenPref(true)}
            aria-expanded={false}
            aria-label={`Buka panel SPARTA Vanguard, ${vehicles.length} kendaraan darurat aktif`}
            className={CHIP_CLASS}
          >
            <Ambulance size={14} className="text-[#8F1610]" />
            <span className="hidden sm:inline">SPARTA Vanguard</span>
            {vehicles.length > 0 && (
              <span className="text-[10px] font-semibold bg-red-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                {vehicles.length}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
