'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { DigitalTwinMap } from '@/components/dashboard/DigitalTwinMap'
import { AiRecommendationPanel } from '@/components/dashboard/AiRecommendationPanel'
import { VanguardPanel } from '@/components/dashboard/VanguardPanel'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

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

export default function EphorDashboard() {
  const [selectedNode, setSelectedNode] = useState<TrafficNode | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'live' | 'prediction' | 'simulation'>('live')

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
    live: { label: 'LIVE', className: 'border-green-500 text-green-600 bg-green-50' },
    prediction: { label: 'PREDIKSI +30M', className: 'border-blue-500 text-blue-600 bg-blue-50' },
    simulation: { label: 'SIMULASI', className: 'border-purple-500 text-purple-600 bg-purple-50' },
  }

  return (
    <div className="h-full flex flex-col">
      {/* Main content grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6 flex-1 min-h-0">
        {/* Map area */}
        <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-border p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black text-[#111827]">Digital Twin Surabaya</h2>
              <Badge variant="outline" className={`text-xs font-bold uppercase ${tabBadge[activeTab].className}`}>
                <span className="w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse bg-current" />
                {tabBadge[activeTab].label}
              </Badge>
            </div>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-auto">
              <TabsList className="h-10 bg-[#f3f4f6] rounded-lg">
                <TabsTrigger value="live" className="text-xs px-4 h-8 font-bold data-[state=active]:bg-[#111827] data-[state=active]:text-white">Live</TabsTrigger>
                <TabsTrigger value="prediction" className="text-xs px-4 h-8 font-bold data-[state=active]:bg-blue-600 data-[state=active]:text-white">Prediction</TabsTrigger>
                <TabsTrigger value="simulation" className="text-xs px-4 h-8 font-bold data-[state=active]:bg-purple-600 data-[state=active]:text-white">Simulation</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>


          <div className="flex-1 rounded-lg overflow-hidden border border-border relative">
            <DigitalTwinMap
              nodes={nodes}
              vehicles={vehicles}
              activeTab={activeTab}
              onNodeSelect={handleNodeSelect}
              onApprove={handleApprove}
            />
          </div>
        </div>

        {/* Right panels */}
        <div className="flex flex-col h-full overflow-hidden gap-1">
          {/* Top Panel - Resizable */}
          <div 
            className="resize-y overflow-hidden pb-4" 
            style={{ height: '50%', minHeight: '200px', maxHeight: '80%' }}
          >
            <div className="h-full pr-1 pb-1">
              <AiRecommendationPanel nodes={nodes} onApprove={handleApprove} />
            </div>
            {/* Custom styled grab handle for resize-y indicator */}
            <div className="absolute bottom-1 right-1 w-4 h-4 pointer-events-none opacity-40">
              <div className="w-full h-full bg-[radial-gradient(circle,currentColor_2px,transparent_2px)] bg-[length:4px_4px]" />
            </div>
          </div>
          
          {/* Bottom Panel - Takes remaining space */}
          <div className="flex-1 min-h-[200px] overflow-hidden pt-2 border-t border-border/50">
            <VanguardPanel vehicles={vehicles} onTrigger={handleTriggerVanguard} />
          </div>
        </div>
      </div>

      {/* Node detail dialog is now embedded in the map as popup */}
    </div>
  )
}
