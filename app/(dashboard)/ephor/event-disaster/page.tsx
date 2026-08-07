'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Calendar, MapPin, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

const mockEvents = [
  {
    id: 1,
    name: 'Grand Prix Kota Surabaya',
    type: 'Olahraga',
    location: 'Jl. Basuki Rahmat – Tunjungan',
    date: '2026-07-10',
    duration: '6 Jam',
    severity: 'TINGGI',
    aiNote: 'Prediksi kemacetan meningkat 70% dalam radius 3km. AI akan mengaktifkan rerouting otomatis.',
  },
  {
    id: 2,
    name: 'Banjir Drainase Wonokromo',
    type: 'Bencana',
    location: 'Wonokromo – Jambangan',
    date: '2026-07-06',
    duration: '12 Jam',
    severity: 'KRITIS',
    aiNote: 'Enam persimpangan tergenang. Direncanakan 15 pengalihan rute. Vanguard siaga.',
  },
]

const severityColors: Record<string, string> = {
  KRITIS: 'bg-red-500',
  TINGGI: 'bg-orange-500',
  SEDANG: 'bg-yellow-500',
}

export default function EventDisasterPage() {
  const [events, setEvents] = useState(mockEvents)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'Olahraga', location: '', date: '', duration: '', severity: 'SEDANG' })

  const handleAdd = () => {
    if (!form.name || !form.location || !form.date) return
    const newEvent = {
      id: events.length + 1,
      ...form,
      aiNote: 'AI sedang mengkalkulasi dampak pada jaringan lalu lintas...',
    }
    setEvents([newEvent, ...events])
    setShowForm(false)
    setForm({ name: '', type: 'Olahraga', location: '', date: '', duration: '', severity: 'SEDANG' })
  }

  const handleDelete = (id: number) => {
    setEvents(events.filter(e => e.id !== id))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-[#111827]">Event & Manajemen Bencana</h2>
          <p className="text-muted-foreground text-sm mt-1">Daftarkan event besar atau kejadian darurat agar AI dapat mempersiapkan rerouting otomatis.</p>
        </div>
        <Button className="bg-[#111827] text-white hover:bg-slate-800 font-bold" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} className="mr-2" /> Tambah Event
        </Button>
      </div>

      {showForm && (
        <Card className="rounded-xl shadow-sm border border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-[#111827]">Input Event / Bencana Baru</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-600">Nama Event</label>
                <input
                  className="w-full border border-slate-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                  placeholder="contoh: Konser Dewa 19..."
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-600">Lokasi</label>
                <input
                  className="w-full border border-slate-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                  placeholder="contoh: Jl. Ahmad Yani"
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-600">Tanggal</label>
                <input
                  type="date"
                  className="w-full border border-slate-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-600">Tingkat Keparahan</label>
                <select
                  className="w-full border border-slate-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400 bg-white"
                  value={form.severity}
                  onChange={e => setForm({ ...form, severity: e.target.value })}
                >
                  <option>SEDANG</option>
                  <option>TINGGI</option>
                  <option>KRITIS</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
              <Button className="bg-[#111827] text-white font-bold" onClick={handleAdd}>Simpan & Notifikasi AI</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {events.map(event => (
          <Card key={event.id} className="rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex flex-col md:flex-row">
              <div className={`${severityColors[event.severity] || 'bg-slate-500'} flex items-center justify-center p-6 w-full md:w-40 shrink-0`}>
                <div className="text-center text-white">
                  <AlertTriangle size={36} className="mx-auto mb-2" />
                  <p className="font-bold text-sm uppercase tracking-wider">{event.severity}</p>
                </div>
              </div>
              <CardContent className="p-6 flex-1">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-bold text-[#111827]">{event.name}</h3>
                      <Badge variant="outline" className="text-xs font-bold">{event.type}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={14} /> <span className="font-medium">{event.location}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} /> <span className="font-medium">{event.date}</span>
                      </div>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-800 font-medium border border-blue-100">
                      <span className="font-bold">🤖 AI Note:</span> {event.aiNote}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(event.id)}
                    className="text-slate-300 hover:text-red-500 transition-colors p-2 shrink-0"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </CardContent>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
