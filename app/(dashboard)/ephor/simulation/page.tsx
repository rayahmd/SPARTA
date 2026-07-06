'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CloudRain, Sun, CloudLightning, Save } from 'lucide-react'
import { useState } from 'react'

export default function SimulationPage() {
  const [trafficVolume, setTrafficVolume] = useState([60])
  const [weather, setWeather] = useState('cerah')

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-black text-[#111827]">Parameter Simulasi</h2>
        <p className="text-muted-foreground text-sm mt-1">Ubah variabel lingkungan untuk menguji respon sistem AI secara real-time.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="rounded-xl shadow-sm border border-slate-200">
           <CardHeader className="border-b border-slate-100 bg-slate-50/50">
             <CardTitle className="text-lg font-bold text-[#111827]">Volume Kendaraan Global</CardTitle>
           </CardHeader>
           <CardContent className="p-6 space-y-6">
             <div className="space-y-4">
               <div className="flex justify-between items-center">
                 <span className="font-bold text-slate-700">Intensitas (Base Level)</span>
                 <span className="font-black text-xl text-[#111827]">{trafficVolume[0]}%</span>
               </div>
               <input
                 type="range"
                 min={0}
                 max={100}
                 step={1}
                 value={trafficVolume[0]}
                 onChange={e => setTrafficVolume([+e.target.value])}
                 className="w-full accent-[#111827] py-4"
               />
               <p className="text-xs text-slate-500">
                 Meningkatkan base level akan memicu kepadatan di seluruh jaringan persimpangan Surabaya.
               </p>
             </div>
             
             <div className="pt-4 border-t border-slate-100 space-y-3">
               <span className="font-bold text-slate-700 block">Status Sistem</span>
               {trafficVolume[0] > 80 ? (
                 <Badge variant="destructive" className="bg-red-500">CRITICAL OVERLOAD</Badge>
               ) : trafficVolume[0] > 50 ? (
                 <Badge className="bg-yellow-500 hover:bg-yellow-600">WARNING (HEAVY TRAFFIC)</Badge>
               ) : (
                 <Badge className="bg-green-500 hover:bg-green-600">NORMAL OPERATIONS</Badge>
               )}
             </div>
           </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm border border-slate-200">
           <CardHeader className="border-b border-slate-100 bg-slate-50/50">
             <CardTitle className="text-lg font-bold text-[#111827]">Kondisi Cuaca & Lingkungan</CardTitle>
           </CardHeader>
           <CardContent className="p-6 space-y-4">
             <div className="grid grid-cols-3 gap-3">
               <button 
                 onClick={() => setWeather('cerah')}
                 className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${weather === 'cerah' ? 'border-[#facc15] bg-yellow-50 text-yellow-700' : 'border-slate-100 hover:border-slate-300'}`}
               >
                 <Sun size={32} />
                 <span className="text-xs font-bold uppercase">Cerah</span>
               </button>
               <button 
                 onClick={() => setWeather('hujan')}
                 className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${weather === 'hujan' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-100 hover:border-slate-300'}`}
               >
                 <CloudRain size={32} />
                 <span className="text-xs font-bold uppercase">Hujan</span>
               </button>
               <button 
                 onClick={() => setWeather('badai')}
                 className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${weather === 'badai' ? 'border-slate-800 bg-slate-100 text-slate-800' : 'border-slate-100 hover:border-slate-300'}`}
               >
                 <CloudLightning size={32} />
                 <span className="text-xs font-bold uppercase">Badai</span>
               </button>
             </div>
             
             <div className="p-4 bg-slate-50 rounded-lg text-sm mt-4">
               <span className="font-bold text-[#111827]">Dampak Efek: </span>
               <span className="text-slate-600">
                 {weather === 'cerah' && 'Kapasitas jalan normal 100%. Kecepatan rata-rata 40km/jam.'}
                 {weather === 'hujan' && 'Kapasitas jalan turun 20%. Jarak pandang berkurang. Kecepatan rata-rata 25km/jam.'}
                 {weather === 'badai' && 'Potensi genangan air di 15 titik kritis. Kapasitas jalan turun 45%. Kecepatan rata-rata 10km/jam.'}
               </span>
             </div>
           </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
        <Button variant="outline" className="font-bold">Reset Default</Button>
        <Button className="bg-[#111827] text-white hover:bg-slate-800 font-bold" onClick={() => alert('Parameter simulasi berhasil diterapkan ke sistem core.')}>
          <Save size={16} className="mr-2" /> Terapkan ke Simulasi
        </Button>
      </div>
    </div>
  )
}
