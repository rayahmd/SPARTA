'use client'
import dynamic from 'next/dynamic'

const MapInner = dynamic(() => import('./DigitalTwinMapInner'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-secondary/50 rounded-lg">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Memuat peta...</span>
      </div>
    </div>
  )
})

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

interface DigitalTwinMapProps {
  nodes: TrafficNode[]
  vehicles?: EmergencyVehicle[]
  activeTab?: 'live' | 'prediction' | 'simulation'
  onNodeSelect: (node: TrafficNode) => void
  onApprove?: (id: string, action: string) => void
  initialOverlays?: Partial<{ cctv: boolean; lights: boolean; vehicles: boolean; buses: boolean; crowd: boolean; events: boolean }>
  topLeftSlot?: React.ReactNode
  focusPadding?: Partial<{ top: number; bottom: number; left: number; right: number }>
  focusVehicle?: { id: string; seq: number } | null
  busView?: { routeId: string | null } | null
  focusBus?: { id: string; seq: number } | null
  onBusSelect?: (id: string) => void
  /** Tampilkan pilihan interval Now / 1–6 jam di bawah peta (mode Live). */
  showHorizonBar?: boolean
}

export function DigitalTwinMap({ nodes, vehicles = [], activeTab = 'live', onNodeSelect, onApprove, initialOverlays, topLeftSlot, focusPadding, focusVehicle, busView, focusBus, onBusSelect, showHorizonBar }: DigitalTwinMapProps) {
  return <MapInner nodes={nodes} vehicles={vehicles} activeTab={activeTab} onNodeSelect={onNodeSelect} onApprove={onApprove} initialOverlays={initialOverlays} topLeftSlot={topLeftSlot} focusPadding={focusPadding} focusVehicle={focusVehicle} busView={busView} focusBus={focusBus} onBusSelect={onBusSelect} showHorizonBar={showHorizonBar} />
}
