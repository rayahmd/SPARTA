'use client'
import useSWR from 'swr'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface Incident {
  id: string
  type: string
  description: string
  status: string
  source: string
  createdAt: string
}

const typeStyles: Record<string, string> = {
  kecelakaan: 'bg-red-100 text-red-700',
  banjir: 'bg-sky-100 text-sky-700',
  jalan_ditutup: 'bg-orange-100 text-orange-700',
  event: 'bg-purple-100 text-purple-700',
  hambatan: 'bg-amber-100 text-amber-700',
}

const sourceStyles = (source: string) =>
  source === 'crowdsource'
    ? 'bg-purple-100 text-purple-700'
    : 'bg-blue-100 text-blue-700'

const formatType = (type: string) =>
  type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

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

      {incidents.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
          <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4 opacity-50" />
          <h3 className="text-lg font-bold text-[#111827]">Tidak ada laporan insiden aktif</h3>
          <p className="text-sm text-slate-500 mt-1">Semua laporan dari masyarakat telah ditangani.</p>
        </div>
      ) : (
        <Card className="rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-lg font-bold text-[#111827]">Laporan Masyarakat Aktif</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">ID</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Tipe</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Deskripsi</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Sumber</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Waktu</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map(incident => (
                  <tr key={incident.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-slate-400 font-bold">{incident.id.slice(0, 6)}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${typeStyles[incident.type] || 'bg-slate-100 text-slate-600'}`}>
                        {formatType(incident.type || 'insiden')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 max-w-sm">{incident.description}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${sourceStyles(incident.source)}`}>
                        {incident.source === 'crowdsource' ? 'Masyarakat' : 'Sistem AI'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-bold font-mono text-xs">{formatTime(incident.createdAt)}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-600">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-1.5" /> Aktif
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Button
                        className="bg-[#111827] hover:bg-slate-800 text-white font-bold text-xs h-8"
                        onClick={() => handleResolve(incident.id)}
                        disabled={resolving === incident.id}
                      >
                        {resolving === incident.id ? 'Memproses...' : 'Tandai Selesai'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}