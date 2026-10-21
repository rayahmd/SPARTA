'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, FileText, BarChart2, CheckCircle, XCircle, Clock } from 'lucide-react'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const simulatedLogs = [
  { id: 'RPT-001', type: 'Agent Terapkan', node: 'Persimpangan Ahmad Yani', action: '+15 dtk hijau, notice ke 2 tetangga', result: 'Diterapkan otomatis', time: '09:14' },
  { id: 'RPT-002', type: 'Insiden', node: 'Kertajaya - Dharmawangsa', action: 'Deteksi kepadatan ekstrim', result: 'Diteruskan', time: '09:01' },
  { id: 'RPT-003', type: 'Vanguard', node: 'Sistem', action: 'Ambulans Unit 12 diaktifkan', result: 'Green Wave ON', time: '08:55' },
  { id: 'RPT-004', type: 'Agent Rollback', node: 'Darmo - Polisi Istimewa', action: '+10 dtk hijau dikembalikan', result: 'Rollback otomatis', time: '08:42' },
  { id: 'RPT-005', type: 'Agent Terapkan', node: 'Diponegoro - Kutai', action: 'Geser offset +9 dtk (koordinasi tetangga)', result: 'Diterapkan otomatis', time: '08:30' },
  { id: 'RPT-006', type: 'Pulse Report', node: 'Wonokromo', action: 'Laporan banjir masyarakat', result: 'Ditindaklanjuti', time: '08:10' },
  { id: 'RPT-007', type: 'Agent Terapkan', node: 'Basuki Rahmat', action: '+10 dtk hijau Utara', result: 'Diterapkan otomatis', time: '07:58' },
]

const typeStyles: Record<string, string> = {
  'Agent Terapkan': 'bg-green-100 text-green-700',
  'Agent Rollback': 'bg-red-100 text-red-600',
  'Insiden': 'bg-orange-100 text-orange-700',
  'Vanguard': 'bg-blue-100 text-blue-700',
  'Pulse Report': 'bg-purple-100 text-purple-700',
}

const handleExport = (format: string) => {
  alert(`Mengekspor laporan dalam format ${format}. Fitur ini akan terhubung ke server di versi produksi.`)
}

export default function ReportsPage() {
  const { data: incidents = [] } = useSWR('/api/incidents', fetcher)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#111827]">Laporan Aktivitas Sistem</h2>
          <p className="text-muted-foreground text-sm mt-1">Riwayat lengkap keputusan agent, override operator, dan insiden.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="font-bold border-slate-300 hover:bg-slate-50" onClick={() => handleExport('CSV')}>
            <Download size={16} className="mr-2" /> Export CSV
          </Button>
          <Button className="bg-[#111827] text-white hover:bg-slate-800 font-bold" onClick={() => handleExport('PDF')}>
            <FileText size={16} className="mr-2" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-xl shadow-sm border border-slate-200 bg-[#111827] text-white">
          <CardContent className="p-5">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Total Aktivitas</p>
            <p className="text-3xl font-bold">{simulatedLogs.length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm border border-slate-200">
          <CardContent className="p-5">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Diterapkan Agent</p>
            <p className="text-3xl font-bold text-green-600">{simulatedLogs.filter(l => l.type === 'Agent Terapkan').length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm border border-slate-200">
          <CardContent className="p-5">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Rollback Agent</p>
            <p className="text-3xl font-bold text-red-500">{simulatedLogs.filter(l => l.type === 'Agent Rollback').length}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm border border-slate-200">
          <CardContent className="p-5">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Insiden Aktif</p>
            <p className="text-3xl font-bold text-orange-500">{incidents.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-lg font-bold text-[#111827]">Log Aktivitas Hari Ini</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">ID</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Tipe</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Lokasi / Node</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Aksi</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Hasil</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Waktu</th>
              </tr>
            </thead>
            <tbody>
              {simulatedLogs.map(log => (
                <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-slate-400 font-bold">{log.id}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${typeStyles[log.type] || 'bg-slate-100 text-slate-600'}`}>
                      {log.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-bold text-[#111827]">{log.node}</td>
                  <td className="px-6 py-4 text-slate-600 max-w-xs truncate">{log.action}</td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-slate-700">{log.result}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 font-bold font-mono text-xs">{log.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
