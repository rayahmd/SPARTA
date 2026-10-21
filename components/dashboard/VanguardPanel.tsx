'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Ambulance, Zap, Map as MapIcon, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  isMinimized?: boolean
  onMinimizeToggle?: () => void
  className?: string
}

export function VanguardPanel({ vehicles, onTrigger, isMinimized = false, onMinimizeToggle, className }: VanguardPanelProps) {
  const [selectedRoute, setSelectedRoute] = useState<EmergencyVehicle | null>(null)
  
  const handleOverride = async (id: string) => {
    console.log(`Manual override activated for vehicle ${id}`)
    alert(`Manual override activated for vehicle ${id}. Green Wave temporarily disabled.`)
  }

  return (
    <>
      <Card className={cn("border-border h-full shadow-sm rounded-lg overflow-hidden flex flex-col bg-white", className)}>
        <CardHeader className="pb-3 pt-4 px-4 shrink-0 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold text-[#111827]">
                SPARTA Vanguard
              </CardTitle>
              {onMinimizeToggle && (
                <button 
                  onClick={onMinimizeToggle} 
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors"
                  title={isMinimized ? "Expand" : "Minimize"}
                >
                  {isMinimized ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </button>
              )}
            </div>
            <Link href="/ephor/vanguard" className="text-xs text-blue-600 hover:underline">
              Lihat Semua
            </Link>
          </div>
        </CardHeader>
        {!isMinimized && (
          <CardContent className="px-4 py-3 flex-1 overflow-y-auto">
          {vehicles.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-70">
              <p className="text-sm text-slate-500">Tidak ada kendaraan darurat aktif</p>
              <Button size="sm" className="bg-[#111827] hover:bg-slate-800 text-white" onClick={onTrigger}>
                <Zap size={14} className="mr-1" /> Trigger Demo
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {vehicles.map((v) => (
                <div key={v.id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-[10px] font-semibold text-green-600">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse" />
                      Auto-priority aktif
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#8F1610] flex items-center justify-center shrink-0">
                      <Ambulance size={20} className="text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#111827] leading-tight mb-0.5">{v.label}</p>
                      <p className="text-[10px] text-slate-400">
                        Dinas Perhubungan → Lokasi kecelakaan
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 rounded-md bg-[#f8fafc] border border-slate-100 flex flex-col items-center justify-center">
                      <p className="text-[10px] text-slate-400 mb-0.5">ETA</p>
                      <p className="text-xs font-semibold text-[#111827]">
                        {v.etaMinutes < 10 ? `0${v.etaMinutes.toFixed(0)}` : v.etaMinutes.toFixed(0)} <span className="font-normal text-[10px]">menit</span>
                      </p>
                    </div>
                    <div className="p-2 rounded-md bg-[#f8fafc] border border-slate-100 flex flex-col items-center justify-center">
                      <p className="text-[10px] text-slate-400 mb-0.5">Jarak</p>
                      <p className="text-xs font-semibold text-[#111827]">
                        {v.distanceKm} <span className="font-normal text-[10px]">km</span>
                      </p>
                    </div>
                    <div className={`p-2 rounded-md border flex flex-col items-center justify-center ${v.greenWaveOn ? 'bg-green-50 border-green-100' : 'bg-[#f8fafc] border-slate-100'}`}>
                      <p className={`text-[10px] mb-0.5 ${v.greenWaveOn ? 'text-green-700' : 'text-slate-400'}`}>Green Wave</p>
                      <p className={`text-xs font-semibold ${v.greenWaveOn ? 'text-green-700' : 'text-slate-400'}`}>
                        {v.greenWaveOn ? 'Aktif' : 'Off'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Progress value={v.progress * 100} className="h-2 flex-1 bg-slate-100" />
                    <p className="text-xs font-semibold text-[#111827]">{(v.progress * 100).toFixed(0)}%</p>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-9 text-xs flex-1 text-[#111827] border-slate-300 hover:bg-slate-50"
                      onClick={() => setSelectedRoute(v)}
                    >
                      Lihat Rute
                    </Button>
                    <Button 
                      size="sm" 
                      className="h-9 text-xs flex-1 bg-[#1e293b] hover:bg-slate-800 text-white"
                      onClick={() => handleOverride(v.id)}
                    >
                      Manual Override
                    </Button>
                  </div>
                </div>
              ))}
              <div className="pt-3 border-t border-slate-100 mt-4">
                <Button size="sm" variant="outline" className="w-full h-9 text-xs border-dashed text-slate-500 hover:bg-slate-50" onClick={onTrigger}>
                  <Zap size={14} className="mr-1" /> Trigger Kendaraan Baru
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
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
              <div className="p-4 bg-slate-50 rounded-md border border-slate-100 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 shrink-0"></div>
                  <div>
                    <p className="text-xs text-slate-500">Titik awal</p>
                    <p className="text-sm font-semibold text-[#111827]">{selectedRoute.originLat.toFixed(4)}, {selectedRoute.originLng.toFixed(4)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-red-500 shrink-0"></div>
                  <div>
                    <p className="text-xs text-slate-500">Lokasi insiden</p>
                    <p className="text-sm font-semibold text-[#111827]">{selectedRoute.destLat.toFixed(4)}, {selectedRoute.destLng.toFixed(4)}</p>
                  </div>
                </div>
              </div>
              
              <div className="p-3 bg-blue-50 text-blue-800 rounded-md text-xs flex items-start gap-2">
                {/* <ShieldAlert size={16} className="shrink-0 mt-0.5" /> */}
                Sistem Green Wave sedang aktif dan akan memprioritaskan lampu hijau di sepanjang rute ini.
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
