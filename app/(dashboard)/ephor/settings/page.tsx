'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bell, Shield, RefreshCw, Save, User, Cpu, Monitor } from 'lucide-react'
import { useState } from 'react'

export default function SettingsPage() {
  const [saved, setSaved] = useState(false)
  const [notifications, setNotifications] = useState({
    criticalAlert: true,
    aiRecommendation: true,
    pulseReport: false,
    vanguardActivation: true,
    dailyReport: false,
  })
  const [aiThreshold, setAiThreshold] = useState(55)
  const [pollingInterval, setPollingInterval] = useState(5)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-[#111827]">Pengaturan Sistem</h2>
        <p className="text-muted-foreground text-sm mt-1">Konfigurasi preferensi notifikasi, threshold AI, dan tampilan operator.</p>
      </div>

      {/* Operator Profile */}
      <Card className="rounded-xl shadow-sm border border-slate-200">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <User size={18} className="text-slate-600" />
            <CardTitle className="text-lg font-bold text-[#111827]">Profil Operator</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex items-center gap-5 mb-6">
            <div className="w-20 h-20 rounded-full bg-[#1e293b] flex items-center justify-center text-white font-bold text-2xl shrink-0">
              O1
            </div>
            <div>
              <h3 className="text-xl font-bold text-[#111827]">Operator 1</h3>
              <p className="text-sm text-slate-500 font-medium">Dinas Perhubungan Kota Surabaya</p>
              <Badge className="mt-2 bg-[#111827] text-white hover:bg-[#111827]">ATCS Level 3 – Full Access</Badge>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-600">Nama Lengkap</label>
              <input className="w-full border border-slate-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" defaultValue="Operator Satu" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-600">Unit Kerja</label>
              <input className="w-full border border-slate-200 rounded-lg p-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-400" defaultValue="ATCS Surabaya" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card className="rounded-xl shadow-sm border border-slate-200">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-slate-600" />
            <CardTitle className="text-lg font-bold text-[#111827]">Preferensi Notifikasi</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {[
            { key: 'criticalAlert', label: 'Alert Kemacetan Kritis', desc: 'Notifikasi ketika tingkat kemacetan > 80%' },
            { key: 'aiRecommendation', label: 'Rekomendasi AI Baru', desc: 'Notifikasi setiap ada rekomendasi AI yang perlu di-review' },
            { key: 'pulseReport', label: 'Laporan Masyarakat (Pulse)', desc: 'Notifikasi setiap ada laporan baru dari Hoplite' },
            { key: 'vanguardActivation', label: 'Aktivasi Vanguard', desc: 'Notifikasi saat kendaraan darurat diaktifkan' },
            { key: 'dailyReport', label: 'Laporan Harian (Email)', desc: 'Ringkasan aktivitas dikirim ke email setiap pukul 23:00' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div>
                <p className="font-bold text-[#111827] text-sm">{item.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
              </div>
              <button
                onClick={() => setNotifications(prev => ({ ...prev, [item.key]: !prev[item.key as keyof typeof prev] }))}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none cursor-pointer ${notifications[item.key as keyof typeof notifications] ? 'bg-[#111827]' : 'bg-slate-300'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${notifications[item.key as keyof typeof notifications] ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* AI & System Settings */}
      <Card className="rounded-xl shadow-sm border border-slate-200">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-slate-600" />
            <CardTitle className="text-lg font-bold text-[#111827]">Konfigurasi AI & Sistem</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-bold text-[#111827]">Threshold Rekomendasi AI</p>
                <p className="text-xs text-slate-500">AI hanya memberi rekomendasi jika kemacetan di atas nilai ini.</p>
              </div>
              <span className="font-bold text-2xl text-[#111827] w-16 text-right">{aiThreshold}%</span>
            </div>
            <input
              type="range" min={10} max={90} step={5}
              value={aiThreshold}
              onChange={e => setAiThreshold(+e.target.value)}
              className="w-full accent-[#111827]"
            />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-bold text-[#111827]">Interval Polling Data (SWR)</p>
                <p className="text-xs text-slate-500">Seberapa sering dashboard memperbarui data dari server.</p>
              </div>
              <span className="font-bold text-2xl text-[#111827] w-24 text-right">{pollingInterval}s</span>
            </div>
            <input
              type="range" min={2} max={30} step={1}
              value={pollingInterval}
              onChange={e => setPollingInterval(+e.target.value)}
              className="w-full accent-[#111827]"
            />
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div>
              <p className="font-bold text-[#111827] text-sm">Mode Auto-Approve AI</p>
              <p className="text-xs text-slate-500 mt-0.5">Jika aktif, AI akan langsung mengeksekusi rekomendasi tanpa persetujuan operator.</p>
            </div>
            <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 font-bold">DINONAKTIFKAN</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-2">
        <Button
          className={`font-bold px-8 transition-all ${saved ? 'bg-green-500 hover:bg-green-600' : 'bg-[#111827] hover:bg-slate-800'} text-white`}
          onClick={handleSave}
        >
          {saved ? '✓ Tersimpan!' : <><Save size={16} className="mr-2" /> Simpan Perubahan</>}
        </Button>
      </div>
    </div>
  )
}
