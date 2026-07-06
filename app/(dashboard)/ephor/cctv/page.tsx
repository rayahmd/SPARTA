'use client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Play, Camera, Maximize2 } from 'lucide-react'

const cameras = [
  { id: 1, name: 'Persimpangan Ahmad Yani', status: 'Online', viewers: 12 },
  { id: 2, name: 'Darmo - Polisi Istimewa', status: 'Online', viewers: 5 },
  { id: 3, name: 'Kertajaya - Dharmawangsa', status: 'Online', viewers: 8 },
  { id: 4, name: 'Diponegoro - Kutai', status: 'Offline', viewers: 0 },
  { id: 5, name: 'Mayjen Sungkono', status: 'Online', viewers: 3 },
  { id: 6, name: 'Basuki Rahmat', status: 'Online', viewers: 21 },
]

export default function CCTVPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-[#111827]">SITS CCTV Network</h2>
          <p className="text-muted-foreground text-sm mt-1">Live feed dari kamera pengawas lalu lintas di seluruh Surabaya.</p>
        </div>
        <Badge className="bg-green-100 text-green-700">124 KAMERA AKTIF</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {cameras.map(cam => (
          <Card key={cam.id} className="rounded-xl overflow-hidden shadow-sm border border-slate-200 group cursor-pointer">
            <div className="relative aspect-video bg-slate-800 flex items-center justify-center overflow-hidden">
              {cam.status === 'Online' ? (
                <>
                  <div className="absolute inset-0 opacity-40 bg-[url('https://images.unsplash.com/photo-1449824913935-59a10b8d2000?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80')] bg-cover bg-center"></div>
                  <Play size={48} className="text-white/50 group-hover:text-white group-hover:scale-110 transition-all z-10" />
                </>
              ) : (
                <div className="text-center text-slate-500">
                  <Camera size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-xs font-bold tracking-widest uppercase">Signal Lost</p>
                </div>
              )}
              
              <div className="absolute top-3 left-3 flex gap-2">
                {cam.status === 'Online' && (
                  <Badge className="bg-red-500 hover:bg-red-600 text-white border-0 animate-pulse">
                    <span className="w-1.5 h-1.5 bg-white rounded-full mr-1.5" />
                    LIVE
                  </Badge>
                )}
              </div>
              <div className="absolute top-3 right-3 text-white/70 hover:text-white transition-colors bg-black/40 p-1.5 rounded-lg backdrop-blur-sm">
                <Maximize2 size={16} />
              </div>
            </div>
            
            <div className="p-4 bg-white">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-[#111827] truncate">{cam.name}</h3>
                <span className={`text-xs font-bold ${cam.status === 'Online' ? 'text-green-500' : 'text-slate-400'}`}>
                  {cam.status}
                </span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Cam ID: SITS-{cam.id.toString().padStart(4, '0')}
                </p>
                {cam.status === 'Online' && (
                  <p className="text-[10px] text-slate-500 font-medium">
                    {cam.viewers} watching
                  </p>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
