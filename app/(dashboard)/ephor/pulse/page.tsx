'use client'
import useSWR from 'swr'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, MapPin, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Incident {
  id: string
  type: string
  description: string
  status: string
}

export default function PulsePage() {
  const { data: incidents = [], mutate } = useSWR<Incident[]>('/api/incidents', fetcher, { refreshInterval: 5000 })
  const [resolving, setResolving] = useState<string | null>(null)

  const handleResolve = async (id: string) => {
    setResolving(id)
    // mock API call
    setTimeout(() => {
      mutate(incidents.filter(i => i.id !== id), false)
      setResolving(null)
    }, 1000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#111827]">SPARTA Pulse</h2>
        <p className="text-muted-foreground text-sm mt-1">Laporan crowdsourcing dari masyarakat via aplikasi Hoplite.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 max-w-4xl">
        {incidents.length === 0 ? (
          <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
            <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4 opacity-50" />
            <h3 className="text-lg font-bold text-[#111827]">Tidak ada laporan insiden aktif</h3>
            <p className="text-sm text-slate-500 mt-1">Semua laporan dari masyarakat telah ditangani.</p>
          </div>
        ) : (
          incidents.map(incident => (
            <Card key={incident.id} className="rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="flex flex-col sm:flex-row">
                <div className="p-6 bg-red-50 flex items-center justify-center shrink-0 border-b sm:border-b-0 sm:border-r border-red-100 w-full sm:w-32">
                  <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                    <AlertTriangle size={32} />
                  </div>
                </div>
                <CardContent className="p-6 flex-1 flex flex-col justify-center">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="destructive" className="bg-red-500 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
                          {incident.type}
                        </Badge>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center">
                          <MapPin size={12} className="mr-1" /> SURABAYA PUSAT
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-[#111827]">{incident.description}</h3>
                      <p className="text-sm text-slate-500 mt-2">
                        Dilaporkan oleh masyarakat via aplikasi Hoplite. Sistem AI telah mendeteksi anomali perlambatan arus di sekitar area ini.
                      </p>
                    </div>
                    <Button 
                      className="bg-[#111827] hover:bg-slate-800 text-white font-bold shrink-0"
                      onClick={() => handleResolve(incident.id)}
                      disabled={resolving === incident.id}
                    >
                      {resolving === incident.id ? 'Memproses...' : 'Tandai Selesai'}
                    </Button>
                  </div>
                </CardContent>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
