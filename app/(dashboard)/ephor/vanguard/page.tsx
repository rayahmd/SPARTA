'use client'
import useSWR from 'swr'
import { VanguardPanel } from '@/components/dashboard/VanguardPanel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Ambulance, Zap, MapPin, Activity } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function VanguardPage() {
  const { data: vehicles = [], mutate: mutateVehicles } = useSWR('/api/vanguard', fetcher, { refreshInterval: 5000 })

  const handleTriggerVanguard = async () => {
    await fetch('/api/vanguard/trigger', { method: 'POST' })
    mutateVehicles()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#111827]">SPARTA Vanguard</h2>
        <p className="text-muted-foreground text-sm mt-1">Sistem prioritas kendaraan darurat (Ambulans, Pemadam Kebakaran, Patwal).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
        <div className="space-y-6">
          <Card className="rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <CardHeader className="border-b border-slate-100 bg-slate-50/50">
               <CardTitle className="text-lg font-bold text-[#111827]">Peta Rute Evakuasi & Green Wave</CardTitle>
             </CardHeader>
             <CardContent className="h-[400px] bg-slate-100 p-0 relative flex items-center justify-center">
               {/* Mockup for map routing */}
               <div className="text-center space-y-4">
                 <div className="w-16 h-16 bg-[#111827] rounded-full mx-auto flex items-center justify-center shadow-lg">
                   <Activity size={32} className="text-[#facc15]" />
                 </div>
                 <div>
                   <p className="font-bold text-[#111827] text-lg">Live Routing Active</p>
                   <p className="text-sm text-slate-500 max-w-sm">
                     Sistem secara otomatis mengubah lampu lalu lintas menjadi hijau (Green Wave) berdasarkan pergerakan GPS ambulans.
                   </p>
                 </div>
               </div>
             </CardContent>
          </Card>
          
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <Zap size={24} className="text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#111827]">{vehicles.filter((v: any) => v.greenWaveOn).length}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Green Wave Aktif</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Ambulance size={24} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-[#111827]">{vehicles.length}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unit Dikerahkan</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="h-[calc(100vh-140px)]">
          <VanguardPanel vehicles={vehicles} onTrigger={handleTriggerVanguard} />
        </div>
      </div>
    </div>
  )
}
