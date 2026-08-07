'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

const weeklyData = [
  { day: 'Sen', kemacetan: 75, insiden: 4, resolved: 3 },
  { day: 'Sel', kemacetan: 68, insiden: 2, resolved: 2 },
  { day: 'Rab', kemacetan: 82, insiden: 7, resolved: 5 },
  { day: 'Kam', kemacetan: 71, insiden: 3, resolved: 3 },
  { day: 'Jum', kemacetan: 90, insiden: 9, resolved: 7 },
  { day: 'Sab', kemacetan: 55, insiden: 1, resolved: 1 },
  { day: 'Min', kemacetan: 40, insiden: 1, resolved: 1 },
]

const causeData = [
  { name: 'Kepadatan Normal', value: 45 },
  { name: 'Kecelakaan', value: 20 },
  { name: 'Cuaca Buruk', value: 15 },
  { name: 'Event Besar', value: 12 },
  { name: 'Infrastruktur', value: 8 },
]

const COLORS = ['#1e293b', '#ef4444', '#3b82f6', '#facc15', '#64748b']

const aiPerformance = [
  { label: 'Prediksi Akurat', value: 94.2, color: 'text-green-600' },
  { label: 'Rekomendasi Disetujui', value: 87.5, color: 'text-blue-600' },
  { label: 'Insiden Terdeteksi Lebih Awal', value: 91.0, color: 'text-[#111827]' },
  { label: 'Pengurangan Waktu Tunggu', value: 23.4, color: 'text-[#f59e0b]' },
]

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#111827]">Analytics & Performance</h2>
        <p className="text-muted-foreground text-sm mt-1">Visualisasi data trafik dan performa sistem</p>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {aiPerformance.map(kpi => (
          <Card key={kpi.label} className="rounded-xl shadow-sm border border-slate-200">
            <CardContent className="p-5 text-center">
              <p className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}%</p>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-2 leading-tight">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        <Card className="rounded-xl shadow-sm border border-slate-200">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg font-bold text-[#111827]">Volume Kemacetan & Insiden (7 Hari)</CardTitle>
              <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 text-xs font-bold">MINGGUAN</Badge>
            </div>
          </CardHeader>
          <CardContent className="h-[300px] pt-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar name="Tingkat Kemacetan (%)" dataKey="kemacetan" fill="#1e293b" radius={[4, 4, 0, 0]} />
                <Bar name="Insiden" dataKey="insiden" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-xl shadow-sm border border-slate-200">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-lg font-bold text-[#111827]">Penyebab Kemacetan</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] pt-6">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={causeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {causeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value}%`} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
