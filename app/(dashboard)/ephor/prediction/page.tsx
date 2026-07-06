'use client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const data = [
  { time: '06:00', actual: 40, predicted: 42 },
  { time: '07:00', actual: 65, predicted: 68 },
  { time: '08:00', actual: 85, predicted: 82 },
  { time: '09:00', actual: 70, predicted: 75 },
  { time: '10:00', actual: 55, predicted: 60 },
  { time: '11:00', actual: 45, predicted: 50 },
  { time: '12:00', actual: null, predicted: 60 },
  { time: '13:00', actual: null, predicted: 55 },
  { time: '14:00', actual: null, predicted: 58 },
  { time: '15:00', actual: null, predicted: 70 },
  { time: '16:00', actual: null, predicted: 85 },
  { time: '17:00', actual: null, predicted: 90 },
]

export default function PredictionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-[#111827]">Traffic Prediction Models</h2>
        <p className="text-muted-foreground text-sm mt-1">Analisis dan prediksi kemacetan berbasis AI.</p>
      </div>

      <Card className="rounded-xl shadow-sm border border-slate-200">
         <CardHeader className="border-b border-slate-100 bg-slate-50/50">
           <CardTitle className="text-lg font-bold text-[#111827]">Prediksi Agregat Harian (Surabaya Pusat)</CardTitle>
         </CardHeader>
         <CardContent className="h-[400px] pt-6">
           <ResponsiveContainer width="100%" height="100%">
             <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
               <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
               <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
               <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dx={-10} />
               <Tooltip 
                 contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
               />
               <Line type="monotone" name="Aktual" dataKey="actual" stroke="#111827" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
               <Line type="monotone" name="Prediksi AI" dataKey="predicted" stroke="#facc15" strokeWidth={3} strokeDasharray="5 5" dot={false} />
             </LineChart>
           </ResponsiveContainer>
         </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[#111827] text-white">
          <CardContent className="p-6">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Model Confidence</p>
            <p className="text-3xl font-black">94.2%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-2">Puncak Kemacetan Sore</p>
            <p className="text-3xl font-black text-[#111827]">17:30 <span className="text-base font-medium text-slate-500">WIB</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-2">Zona Merah Diprediksi</p>
            <p className="text-3xl font-black text-[#ef4444]">12 <span className="text-base font-medium text-slate-500">Persimpangan</span></p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
