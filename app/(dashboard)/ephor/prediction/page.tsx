'use client'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { DigitalTwinMap } from '@/components/dashboard/DigitalTwinMap'

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

const mapTimes = ['Now', '15 Menit']

// Real Surabaya coordinates for the named congestion corridors from the demo dataset
const nodes: TrafficNode[] = [
  {
    id: 'ahmad-yani',
    name: 'Persimpangan Ahmad Yani',
    lat: -7.3172,
    lng: 112.7345,
    currentLevel: 71,
    predicted30: 92,
    confidence: 95,
    recommendation: 'Tambah durasi hijau +10 detik',
  },
  {
    id: 'darmo-polisi-istimewa',
    name: 'Darmo - Polisi Istimewa',
    lat: -7.2879,
    lng: 112.7383,
    currentLevel: 65,
    predicted30: 88,
    confidence: 92,
    recommendation: null,
  },
  {
    id: 'diponegoro-kutai',
    name: 'Diponegoro - Kutai',
    lat: -7.2789,
    lng: 112.7345,
    currentLevel: 60,
    predicted30: 84,
    confidence: 90,
    recommendation: null,
  },
  {
    id: 'kertajaya-dharmawangsa',
    name: 'Kertajaya - Dharmawangsa',
    lat: -7.2775,
    lng: 112.758,
    currentLevel: 58,
    predicted30: 81,
    confidence: 89,
    recommendation: null,
  },
]

// No live ambulance/PMK runs on this page yet — wire this up once Vanguard
// exposes real emergency-vehicle data.
const vehicles: EmergencyVehicle[] = []

const forecastOverview = {
  Now: { congestion: '71%', eta: '12 mnt', queue: '98 Kendaraan', hotspot: 3 },
  '15 Menit': { congestion: '78%', eta: '14 mnt', queue: '112 Kendaraan', hotspot: 4 },
}

export default function PredictionPage() {
  const [selectedTime, setSelectedTime] = useState('15 Menit')
  const [selectedNode, setSelectedNode] = useState<TrafficNode>(nodes[0])
  const [approvedIds, setApprovedIds] = useState<string[]>([])

  const forecast = useMemo(() => forecastOverview[selectedTime as keyof typeof forecastOverview], [selectedTime])

  function handleNodeSelect(node: TrafficNode) {
    setSelectedNode(node)
  }

  function handleApprove(id: string, action: string) {
    // Hook this up to your real approval endpoint (e.g. Intersection Controller
    // tiered-approval flow) — logging here as a placeholder.
    console.log('Approving recommendation', { id, action })
    setApprovedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  return (
    <div className="space-y-2">
     

      <div className="grid gap-3 xl:grid-cols-[1.9fr_1fr] items-start">
        {/* MAP PANEL */}
        <Card className="rounded-[32px] border border-slate-200 shadow-sm overflow-hidden self-start">
          <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-3">
            <div className="flex lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-black">Peta Prediksi Kemacetan</h2>
                <p className="text-black text-sm">Visualisasi prediksi kepadatan lalu lintas jangka pendek.</p>
              </div>
              <Button className="h-9 rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50">Play Forecast</Button>
            </div>

            {/* Note: TrafficNode only carries `predicted30`, so the time tabs above
               currently just drive the stat cards below the map. If you want the
               map itself to reflect Now/15/60, extend TrafficNode with per-horizon
               fields (or refetch `nodes` per selectedTime from your simulation API). */}
          </div>

          <CardContent className="">
            <div className="h-full rounded-lg overflow-hidden border border-slate-200 relative">
              <DigitalTwinMap
                nodes={nodes}
                vehicles={vehicles}
                activeTab="prediction"
                onNodeSelect={handleNodeSelect}
                onApprove={handleApprove}
                initialOverlays={{ cctv: true, lights: true, vehicles: true, crowd: false, events: true }}
              />
            </div>
            <div className="mt-3 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-slate-400">Forecast Summary</p>
                  <p className="mt-1 text-base font-bold text-slate-950">{selectedTime} — {forecast.hotspot} Hotspot</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-2.5 text-sm text-slate-700">
                    <p className="font-bold text-slate-950">Kemacetan</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{forecast.congestion}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-2.5 text-sm text-slate-700">
                    <p className="font-bold text-slate-950">Waktu Tempuh</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{forecast.eta}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-2.5 text-sm text-slate-700">
                    <p className="font-bold text-slate-950">Panjang Antrian</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">{forecast.queue}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT PANELS */}
        <div className="flex flex-col gap-4">
          <Card className="rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base font-bold text-slate-950">Top Predicted Congestion</CardTitle>
                  <p className="mt-0.5 text-xs text-slate-500">Lihat semua titik kritis kemacetan</p>
                </div>
                <button className="text-xs font-bold text-blue-600 hover:text-blue-700">Lihat Semua</button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 p-4">
              {nodes.map((node, i) => (
                <button
                  key={node.id}
                  onClick={() => handleNodeSelect(node)}
                  className={`w-full text-left rounded-2xl border p-3 transition ${
                    selectedNode.id === node.id
                      ? 'border-slate-900 bg-slate-900/[0.03]'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600">
                        <span className="text-xs font-bold">{i + 1}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-950 leading-tight">{node.name}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-right">
                      <div>
                        <p className="text-sm font-bold text-slate-950 leading-tight">{node.predicted30}%</p>
                        <p className="text-[10px] text-slate-500">Prediksi</p>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-950 leading-tight">{node.confidence}%</p>
                        <p className="text-[10px] text-slate-500">Confidence</p>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
              <CardTitle className="text-base font-bold text-slate-950">Rekomendasi Utama</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-950">{selectedNode.name}</p>
                    <p className="text-xs text-slate-500">Prediksi 15 menit ke depan</p>
                  </div>
                  <span className="inline-flex items-center rounded-xl bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-600">
                    {selectedNode.predicted30 >= 90 ? 'Tinggi' : selectedNode.predicted30 >= 80 ? 'Sedang' : 'Rendah'}
                  </span>
                </div>

                <div className="text-sm text-slate-600">
                  <p className="font-bold">Rekomendasi AI</p>
                  <p className="mt-1">{selectedNode.recommendation ?? 'Tidak ada rekomendasi otomatis untuk titik ini.'}</p>
                </div>

                <div className="grid gap-2 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                  <div className="flex items-center justify-between">
                    <span>Kemacetan saat ini</span>
                    <span className="font-bold text-slate-900">{selectedNode.currentLevel}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Prediksi 30 menit</span>
                    <span className="font-bold text-red-600">{selectedNode.predicted30}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Confidence</span>
                    <span className="font-bold text-slate-900">{selectedNode.confidence}%</span>
                  </div>
                </div>
              </div>

              <Button
                disabled={!selectedNode.recommendation || approvedIds.includes(selectedNode.id)}
                onClick={() => handleApprove(selectedNode.id, 'increase_green_time')}
                className="mt-4 w-full h-11 rounded-2xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 disabled:opacity-50"
              >
                {approvedIds.includes(selectedNode.id) ? 'Disetujui ✓' : 'Review & Approve'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}