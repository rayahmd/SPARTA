'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { DigitalTwinMap } from '@/components/dashboard/DigitalTwinMap'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog'
import { 
  AlertTriangle, Send, Phone, MapPin, Bus, Route, ShieldAlert, Radio
} from 'lucide-react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

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

interface Incident {
  id: string
  type: string
  description: string
  lat: number
  lng: number
  status: string
  createdAt: string
}

export default function HoplitePage() {
  const [selectedNode, setSelectedNode] = useState<TrafficNode | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [panicOpen, setPanicOpen] = useState(false)
  const [reportForm, setReportForm] = useState({ type: 'hambatan', description: '' })
  const [submitting, setSubmitting] = useState(false)

  const { data: nodes = [] } = useSWR<TrafficNode[]>(
    '/api/traffic-nodes', fetcher, { refreshInterval: 5000 }
  )
  const { data: incidents = [] } = useSWR<Incident[]>(
    '/api/incidents', fetcher, { refreshInterval: 5000 }
  )

  const handleReport = async () => {
    if (!reportForm.description.trim()) return
    setSubmitting(true)
    const center = nodes.length > 0 
      ? nodes[Math.floor(Math.random() * nodes.length)]
      : { lat: -7.28, lng: 112.74 }

    await fetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: reportForm.type,
        lat: center.lat + (Math.random() * 0.002 - 0.001),
        lng: center.lng + (Math.random() * 0.002 - 0.001),
        description: reportForm.description
      })
    })
    setReportForm({ type: 'hambatan', description: '' })
    setSubmitting(false)
    setReportOpen(false)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-sidebar text-sidebar-foreground px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold">SPARTA Hoplite</h1>
            <p className="text-[10px] text-sidebar-foreground/60">Info Lalu Lintas Surabaya</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-green-500 text-green-400 text-[10px]">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1 animate-pulse" />
            LIVE
          </Badge>
        </div>
      </header>

      {/* Map */}
      <div className="h-[50vh] relative">
        <DigitalTwinMap nodes={nodes} onNodeSelect={setSelectedNode} />
        
        {/* Floating info for selected node */}
        {selectedNode && (
          <div className="absolute bottom-4 left-4 right-4 z-[1000] bg-card border border-border rounded-lg shadow-xl p-4 max-w-sm mx-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-sm">{selectedNode.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Kemacetan: <span className="font-bold text-foreground">{selectedNode.currentLevel}%</span>
                  {' • '}
                  Prediksi: <span className="font-bold text-foreground">{selectedNode.predicted30}%</span>
                </p>
              </div>
              <button 
                className="text-muted-foreground hover:text-foreground text-xs"
                onClick={() => setSelectedNode(null)}
              >✕</button>
            </div>
            {selectedNode.recommendation && (
              <div className="mt-2 p-2 bg-primary/5 border border-primary/20 rounded text-xs">
                <span className="font-semibold text-primary">💡 {selectedNode.recommendation}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom section */}
      <div className="p-4 space-y-4">
        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            className="bg-destructive hover:bg-destructive/90 text-white h-14 text-sm font-bold flex flex-col gap-1"
            onClick={() => setPanicOpen(true)}
          >
            <Phone size={18} />
            Panic Button
          </Button>
          <Button 
            className="bg-primary hover:bg-primary/90 text-primary-foreground h-14 text-sm font-bold flex flex-col gap-1"
            onClick={() => setReportOpen(true)}
          >
            <Radio size={18} />
            Lapor Insiden
          </Button>
        </div>

        {/* Quick Info */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-border">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-md bg-blue-50 text-blue-600">
                <Route size={18} />
              </div>
              <div>
                <p className="text-xs font-bold">Rute Alternatif</p>
                <p className="text-[10px] text-muted-foreground">3 rute tersedia</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="p-2 rounded-md bg-green-50 text-green-600">
                <Bus size={18} />
              </div>
              <div>
                <p className="text-xs font-bold">Transportasi Umum</p>
                <p className="text-[10px] text-muted-foreground">Info jadwal</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Active Incidents */}
        <Card className="border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <AlertTriangle size={16} className="text-destructive" />
              Insiden Aktif ({incidents.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2 max-h-[200px] overflow-y-auto">
            {incidents.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Tidak ada insiden aktif</p>
            ) : (
              incidents.slice(0, 5).map((inc) => (
                <div key={inc.id} className="flex items-start gap-2 p-2 rounded bg-secondary/50 border border-border">
                  <MapPin size={14} className="text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">{inc.type.replace('_', ' ').toUpperCase()}</p>
                    <p className="text-[10px] text-muted-foreground">{inc.description}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Report Dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio size={18} className="text-primary" />
              SPARTA-Pulse: Lapor Insiden
            </DialogTitle>
            <DialogDescription>
              Laporkan kondisi lalu lintas di sekitar Anda
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Jenis Insiden</label>
              <select 
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={reportForm.type}
                onChange={(e) => setReportForm(prev => ({ ...prev, type: e.target.value }))}
              >
                <option value="hambatan">Hambatan</option>
                <option value="kecelakaan">Kecelakaan</option>
                <option value="banjir">Banjir</option>
                <option value="jalan_ditutup">Jalan Ditutup</option>
                <option value="event">Event</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Deskripsi</label>
              <textarea 
                className="w-full min-h-[80px] px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
                placeholder="Jelaskan kondisi yang Anda lihat..."
                value={reportForm.description}
                onChange={(e) => setReportForm(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <Button 
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={handleReport}
              disabled={submitting || !reportForm.description.trim()}
            >
              <Send size={14} className="mr-2" />
              {submitting ? 'Mengirim...' : 'Kirim Laporan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Panic Button Dialog */}
      <Dialog open={panicOpen} onOpenChange={setPanicOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Phone size={18} />
              Panic Button
            </DialogTitle>
            <DialogDescription>
              Hubungi layanan darurat terdekat
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Button variant="outline" className="w-full h-12 justify-start gap-3" asChild>
              <a href="tel:112">
                <Phone size={16} className="text-destructive" /> 
                <span className="font-bold">112</span> — Nomor Darurat Nasional
              </a>
            </Button>
            <Button variant="outline" className="w-full h-12 justify-start gap-3" asChild>
              <a href="tel:118">
                <Phone size={16} className="text-destructive" /> 
                <span className="font-bold">118</span> — Ambulans
              </a>
            </Button>
            <Button variant="outline" className="w-full h-12 justify-start gap-3" asChild>
              <a href="tel:113">
                <Phone size={16} className="text-destructive" /> 
                <span className="font-bold">113</span> — Pemadam Kebakaran
              </a>
            </Button>
            <Button variant="outline" className="w-full h-12 justify-start gap-3" asChild>
              <a href="tel:110">
                <Phone size={16} className="text-destructive" /> 
                <span className="font-bold">110</span> — Polisi
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
