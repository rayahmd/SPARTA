'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Ambulance, Zap, Map as MapIcon, ShieldAlert } from 'lucide-react'

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

export interface VanguardPanelProps {
  vehicles: EmergencyVehicle[]
  onTrigger: () => void
}

export function VanguardPanel({ vehicles, onTrigger }: VanguardPanelProps) {
  const [selectedRoute, setSelectedRoute] = useState<any | null>(null)
  
  const handleOverride = async (id: string) => {
    console.log(`Manual override activated for vehicle ${id}`)
    alert(`Manual override activated for vehicle ${id}. Green Wave temporarily disabled.`)
  }

  return (
    <>
      <Card className="border-border h-full shadow-sm rounded-xl overflow-hidden flex flex-col bg-white">
        <CardHeader className="pb-4 pt-5 px-6 shrink-0 border-b border-border/50">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-black text-[#111827]">
              SPARTA-Vanguard
            </CardTitle>
            <button className="text-xs text-blue-600 hover:underline font-bold">
              Lihat Semua
            </button>
          </div>
        </CardHeader>
        <CardContent className="px-6 py-6 flex-1 overflow-y-auto">
          {vehicles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-70">
              <p className="text-sm font-medium text-slate-500">Tidak ada kendaraan darurat aktif</p>
              <Button size="sm" className="bg-[#111827] hover:bg-slate-800 text-white font-bold" onClick={onTrigger}>
                <Zap size={14} className="mr-1" /> Trigger Demo
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {vehicles.map((v) => (
                <div key={v.id} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-[10px] font-bold text-green-600 uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse" />
                      AUTO-PRIORITY ACTIVE
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#1e1b4b] flex items-center justify-center shrink-0">
                      <Ambulance size={24} className="text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#111827] leading-tight mb-1">{v.label}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        DINAS PERHUBUNGAN → LOKASI KECELAKAAN
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-2.5 rounded-lg bg-[#f8fafc] border border-slate-100 flex flex-col items-center justify-center">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">ETA</p>
                      <p className="text-xs font-black text-[#111827]">
                        {v.etaMinutes < 10 ? `0${v.etaMinutes.toFixed(0)}` : v.etaMinutes.toFixed(0)} <span className="font-medium text-[10px]">menit</span>
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[#f8fafc] border border-slate-100 flex flex-col items-center justify-center">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-0.5">JARAK</p>
                      <p className="text-xs font-black text-[#111827]">
                        {v.distanceKm} <span className="font-medium text-[10px]">km</span>
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-green-50 border border-green-100 flex flex-col items-center justify-center">
                      <p className="text-[10px] text-green-700 font-bold uppercase tracking-widest mb-0.5">GREEN WAVE</p>
                      <p className={`text-xs font-black ${v.greenWaveOn ? 'text-green-700' : 'text-slate-400'}`}>
                        {v.greenWaveOn ? 'Aktif' : 'Off'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Progress value={v.progress * 100} className="h-2.5 flex-1 bg-slate-100" />
                    <p className="text-xs font-bold text-[#111827]">{(v.progress * 100).toFixed(0)}%</p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-10 text-xs flex-1 font-bold text-[#111827] border-slate-300 hover:bg-slate-50"
                      onClick={() => setSelectedRoute(v)}
                    >
                      Lihat Rute
                    </Button>
                    <Button 
                      size="sm" 
                      className="h-10 text-xs flex-1 bg-[#1e293b] hover:bg-slate-800 text-white font-bold"
                      onClick={() => handleOverride(v.id)}
                    >
                      Manual Override
                    </Button>
                  </div>
                </div>
              ))}
              <div className="pt-4 border-t border-slate-100 mt-6">
                <Button size="sm" variant="outline" className="w-full h-10 text-xs border-dashed text-slate-500 font-bold hover:bg-slate-50" onClick={onTrigger}>
                  <Zap size={14} className="mr-1" /> Trigger Kendaraan Baru
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedRoute} onOpenChange={(open) => !open && setSelectedRoute(null)}>
        <DialogContent className="sm:max-w-[425px] bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapIcon className="text-blue-600" />
              Detail Rute Kendaraan
            </DialogTitle>
          </DialogHeader>
          {selectedRoute && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-100 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 shrink-0"></div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">TITIK AWAL</p>
                    <p className="text-sm font-bold text-[#111827]">{selectedRoute.originLat.toFixed(4)}, {selectedRoute.originLng.toFixed(4)}</p>
                  </div>
                </div>
                <div className="w-0.5 h-6 bg-slate-200 ml-1.5 my-[-8px]"></div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-red-500 shrink-0"></div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">LOKASI INSIDEN</p>
                    <p className="text-sm font-bold text-[#111827]">{selectedRoute.destLat.toFixed(4)}, {selectedRoute.destLng.toFixed(4)}</p>
                  </div>
                </div>
              </div>
              
              <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-xs font-medium flex items-start gap-2">
                <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                Sistem Green Wave sedang aktif dan akan memprioritaskan lampu hijau di sepanjang rute ini.
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
