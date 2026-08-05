'use client'
import dynamic from 'next/dynamic'
import { Badge } from '@/components/ui/badge'
import { Camera, Video } from 'lucide-react'

const CCTVMap = dynamic(() => import('@/components/dashboard/CCTVMap').then((m) => m.CCTVMap), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[520px] flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-2 text-slate-400">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Memuat peta...</span>
      </div>
    </div>
  ),
})

const cameras = [
  { id: '0001', name: 'Persimpangan Ahmad Yani', status: 'Online', area: 'Barat', lat: -7.2621, lng: 112.7348 },
  { id: '0002', name: 'Darmo - Polisi Istimewa', status: 'Online', area: 'Tenggara', lat: -7.2857, lng: 112.7442 },
  { id: '0003', name: 'Kertajaya - Dharmawangsa', status: 'Online', area: 'Timur', lat: -7.2801, lng: 112.7604 },
  { id: '0004', name: 'Diponegoro - Kutai', status: 'Offline', area: 'Pusat', lat: -7.2664, lng: 112.7491 },
  { id: '0005', name: 'Mayjen Sungkono', status: 'Online', area: 'Tenggara', lat: -7.2710, lng: 112.7478 },
  { id: '0006', name: 'Basuki Rahmat', status: 'Online', area: 'Timur', lat: -7.2669, lng: 112.7412 },
]

export default function CCTVPage() {
  return (
    <div className="relative flex min-h-[640px] flex-col overflow-hidden rounded-[28px] bg-white shadow-lg border border-border">
      <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500 font-semibold">Peta CCTV</p>
          <h2 className="text-2xl font-black text-slate-900">Distribusi Kamera Surabaya</h2>
          <p className="text-sm text-slate-500 mt-1">Logo CCTV menunjukkan titik kamera yang tersebar di kota.</p>
        </div>
        <Badge className="bg-slate-100 text-slate-800 text-xs font-bold uppercase px-3 py-2">{cameras.length} titik</Badge>
      </div>

      <div className="relative min-h-[520px] overflow-hidden">
        <div className="h-[520px] w-full">
          <CCTVMap
            nodes={cameras.map((cam) => ({
              id: cam.id,
              name: cam.name,
              lat: cam.lat,
              lng: cam.lng,
              currentLevel: cam.status === 'Online' ? 0 : 1,
            }))}
          />
        </div>

        <div className="absolute top-6 right-6 z-[9999] w-[360px] max-h-[calc(100%-3rem)] flex flex-col overflow-hidden rounded-[32px] border border-slate-900/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl text-white">
          <div className="px-5 py-5 border-b border-slate-800/70 flex items-center gap-3 shrink-0">
            <div className="bg-slate-900 p-3 rounded-2xl border border-slate-700">
              <Video size={18} className="text-white" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400 font-semibold">Daftar Kamera</p>
              <p className="text-lg font-black">SPARTA CCTV Overlay</p>
            </div>
          </div>

          {/* min-h-0 wajib ada di sini supaya flex child ini bisa shrink dan overflow-y-auto beneran aktif */}
          <div className="px-5 py-4 space-y-4 overflow-y-auto min-h-0 flex-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
            {cameras.map((cam) => (
              <div
                key={cam.id}
                className="rounded-3xl border border-slate-800/60 bg-slate-900/95 p-4 transition hover:border-slate-600 hover:bg-slate-800"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white truncate">{cam.name}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{cam.area}</p>
                  </div>
                  <span
                    className={`text-[10px] font-black uppercase ${
                      cam.status === 'Online' ? 'text-emerald-300' : 'text-slate-500'
                    }`}
                  >
                    {cam.status}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 font-semibold uppercase tracking-[0.25em]">
                  <span>ID SITS-{cam.id}</span>
                  <span className="flex items-center gap-1">
                    <Camera size={12} /> {cam.status === 'Online' ? 'Live' : 'Offline'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}