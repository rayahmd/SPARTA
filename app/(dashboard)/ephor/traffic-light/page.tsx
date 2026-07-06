'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Edit2, Play, Square, Settings2 } from 'lucide-react'
import { useState } from 'react'

const initialLights = [
  { id: 1, name: 'Persimpangan Ahmad Yani', status: 'hijau', greenSec: 45, redSec: 90 },
  { id: 2, name: 'Darmo - Polisi Istimewa', status: 'merah', greenSec: 30, redSec: 120 },
  { id: 3, name: 'Kertajaya - Dharmawangsa', status: 'kuning', greenSec: 35, redSec: 85 },
  { id: 4, name: 'Diponegoro - Kutai', status: 'hijau', greenSec: 40, redSec: 100 },
  { id: 5, name: 'Mayjen Sungkono (HR Muhammad)', status: 'merah', greenSec: 50, redSec: 140 },
  { id: 6, name: 'Basuki Rahmat (Tunjungan)', status: 'merah', greenSec: 45, redSec: 110 },
]

export default function TrafficLightPage() {
  const [lights, setLights] = useState(initialLights)

  const overrideLight = (id: number, newStatus: string) => {
    setLights(lights.map(l => l.id === id ? { ...l, status: newStatus } : l))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-[#111827]">ATCS Control Panel</h2>
          <p className="text-muted-foreground text-sm mt-1">Status real-time dan kontrol manual API ATCS Surabaya.</p>
        </div>
        <div className="flex gap-2">
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">API CONNECTED</Badge>
          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">AI AUTO-CYCLE AKTIF</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {lights.map(light => (
          <Card key={light.id} className="rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex flex-col sm:flex-row items-stretch h-full">
              <div className="p-6 bg-slate-50 border-b sm:border-b-0 sm:border-r border-slate-100 flex flex-col justify-center items-center w-full sm:w-32 shrink-0">
                <div className="w-12 h-24 bg-[#111827] rounded-full p-2 flex flex-col justify-between items-center shadow-inner">
                  <div className={`w-8 h-8 rounded-full transition-colors ${light.status === 'merah' ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.7)]' : 'bg-red-900/50'}`}></div>
                  <div className={`w-8 h-8 rounded-full transition-colors ${light.status === 'kuning' ? 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.7)]' : 'bg-yellow-900/50'}`}></div>
                  <div className={`w-8 h-8 rounded-full transition-colors ${light.status === 'hijau' ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.7)]' : 'bg-green-900/50'}`}></div>
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-[#111827] text-lg">{light.name}</h3>
                  <div className="flex gap-4 mt-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Durasi Hijau</p>
                      <p className="text-lg font-black text-green-600">{light.greenSec}s</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Durasi Merah</p>
                      <p className="text-lg font-black text-red-500">{light.redSec}s</p>
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">MANUAL OVERRIDE</p>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className={`flex-1 text-xs font-bold ${light.status === 'merah' ? 'border-red-500 text-red-600 bg-red-50' : ''}`}
                      onClick={() => overrideLight(light.id, 'merah')}
                    >
                      Hold Red
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className={`flex-1 text-xs font-bold ${light.status === 'hijau' ? 'border-green-500 text-green-600 bg-green-50' : ''}`}
                      onClick={() => overrideLight(light.id, 'hijau')}
                    >
                      Hold Green
                    </Button>
                    <Button size="sm" className="bg-[#111827] text-white hover:bg-slate-800">
                      <Settings2 size={16} />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
