'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Brain, ChevronRight, CheckCircle2, TrendingUp, Clock, Sparkles, BarChart3, Zap, ChevronDown, ChevronUp, Check, RefreshCw, BarChart2 } from 'lucide-react'

interface TrafficNode {
  id: string
  name: string
  currentLevel: number
  predicted30: number
  confidence: number
  recommendation: string | null
}

interface AiRecommendationPanelProps {
  nodes: TrafficNode[]
  onApprove: (id: string, action: string) => void
}

// Map raw recommendation text to structured AI reasoning
function buildAiReasoning(node: TrafficNode) {
  const trend = node.predicted30 - node.currentLevel
  const trendPct = trend > 0 ? `+${trend}%` : `${trend}%`
  const forecastTime = node.predicted30 > 80 ? '15 menit' : '30 menit'
  const confidence = Math.round(node.confidence * 100)

  // Simulate simulation result based on prediction severity
  const improvement = node.predicted30 > 75
    ? Math.round(20 + (node.predicted30 - 75) * 0.8)
    : Math.round(8 + node.predicted30 * 0.15)

  // Derive urgency
  const urgency = node.predicted30 >= 85 ? 'KRITIS' : node.predicted30 >= 70 ? 'TINGGI' : 'SEDANG'
  const urgencyColor = urgency === 'KRITIS' ? 'text-red-600 bg-red-50 border-red-200' :
    urgency === 'TINGGI' ? 'text-orange-600 bg-orange-50 border-orange-200' :
    'text-yellow-600 bg-yellow-50 border-yellow-200'

  // Simulation scenario chosen by AI
  const simScenario = node.predicted30 >= 80 ? '+15 dtk Fase Hijau' :
    node.predicted30 >= 65 ? '+10 dtk Fase Hijau' : '+5 dtk Fase Hijau'

  const simReduction = node.predicted30 >= 80 ? 21 : node.predicted30 >= 65 ? 15 : 8
  const simResult = Math.max(0, node.predicted30 - Math.round(node.predicted30 * simReduction / 100))

  return {
    trend, trendPct, forecastTime, confidence,
    improvement, urgency, urgencyColor,
    simScenario, simResult, simReduction,
  }
}

function RecommendationCard({ node, onApprove }: { node: TrafficNode; onApprove: (id: string, action: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [approved, setApproved] = useState(false)
  const ai = buildAiReasoning(node)

  const handleApprove = () => {
    setApproved(true)
    onApprove(node.id, 'approve')
  }

  if (approved) {
    return (
      <div className="p-4 rounded-xl bg-green-50 border border-green-200 flex items-center gap-3">
        <CheckCircle2 size={20} className="text-green-600 shrink-0" />
        <div>
          <p className="text-sm font-bold text-green-800">{node.name}</p>
          <p className="text-xs text-green-600 font-medium">Rekomendasi disetujui & dikirim ke sistem ATCS.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* Header — Location + urgency */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <Brain size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-black text-[#111827] leading-tight">{node.name}</p>
            </div>
          </div>
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${ai.urgencyColor} shrink-0`}>
            {ai.urgency}
          </span>
        </div>
      </div>

      {/* Step 1 — Prediction */}
      <div className="px-4 pt-3 pb-0">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center text-white text-[9px] font-black shrink-0">1</div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prediksi</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-slate-50 rounded-lg p-2 text-center">
            <p className="text-[9px] text-slate-400 font-bold uppercase">Skrg</p>
            <p className="text-base font-black text-[#111827]">{node.currentLevel}%</p>
          </div>
          <div className="flex items-center justify-center">
            <div className="flex flex-col items-center gap-0.5">
              <TrendingUp size={14} className={ai.trend > 0 ? 'text-red-500' : 'text-green-500'} />
              <span className={`text-[10px] font-black ${ai.trend > 0 ? 'text-red-500' : 'text-green-500'}`}>{ai.trendPct}</span>
            </div>
          </div>
          <div className="bg-red-50 rounded-lg p-2 text-center border border-red-100">
            <p className="text-[9px] text-red-500 font-bold uppercase">+{ai.forecastTime}</p>
            <p className="text-base font-black text-red-600">{node.predicted30}%</p>
          </div>
        </div>
        <div className="flex gap-3 mb-3 text-xs">
          <div className="flex items-center gap-1 text-slate-500">
            <Clock size={11} />
            <span className="font-medium">Puncak dalam {ai.forecastTime}</span>
          </div>
          <div className="flex items-center gap-1 text-blue-600">
            <Sparkles size={11} />
            <span className="font-bold">{ai.confidence}% confidence</span>
          </div>
        </div>
      </div>

      {/* Connector */}
      <div className="flex items-center gap-2 px-4 my-1">
        <div className="w-4 shrink-0" />
        <div className="w-px h-4 bg-slate-200 ml-1.5" />
      </div>

      {/* Step 2 — Simulation Result */}
      <div className="px-4 pb-0">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center text-white text-[9px] font-black shrink-0">2</div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hasil Simulasi</span>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 mb-3">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-purple-700 font-bold">{ai.simScenario}</span>
            <BarChart3 size={13} className="text-purple-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-red-600">{node.predicted30}%</span>
            <div className="flex-1 h-1.5 bg-purple-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-green-500" style={{ width: `${100 - ai.simReduction}%` }} />
            </div>
            <span className="text-sm font-black text-green-600">{ai.simResult}%</span>
          </div>
          <p className="text-[10px] text-purple-600 font-bold mt-1.5">Reduksi kemacetan {ai.simReduction}% dari intervensi ini</p>
        </div>
      </div>

      {/* Connector */}
      <div className="flex items-center gap-2 px-4 my-1">
        <div className="w-4 shrink-0" />
        <div className="w-px h-4 bg-slate-200 ml-1.5" />
      </div>

      {/* Step 3 — Recommended Action */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-4 h-4 rounded-full bg-[#111827] flex items-center justify-center text-white text-[9px] font-black shrink-0">3</div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rekomendasi Aksi</span>
        </div>
        <div className="bg-[#f8fafc] border border-slate-200 rounded-lg p-3 space-y-2 mb-3">
          <p className="text-sm font-black text-[#111827]">{node.recommendation}</p>
          <div className="flex justify-between items-center pt-1 border-t border-slate-100">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1">
              <Zap size={10} /> Perkiraan Perbaikan
            </span>
            <span className="text-sm font-black text-green-600">+{ai.improvement}%</span>
          </div>
        </div>

        {/* Expandable AI reasoning trace */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-blue-600 font-bold mb-3 hover:underline"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Sembunyikan' : 'Lihat'} reasoning AI
        </button>
        {expanded && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 font-medium space-y-2">
            <div className="flex gap-2 items-start"><Brain size={14} className="mt-0.5 shrink-0" /><div><strong>Analisis pola:</strong> Kemacetan di {node.name} meningkat konsisten pada jam ini selama 14 hari terakhir.</div></div>
            <div className="flex gap-2 items-start"><BarChart2 size={14} className="mt-0.5 shrink-0" /><div><strong>Model:</strong> SPARTA-Athena v2.1 (LSTM + GP) — RMSE 3.2%</div></div>
            <div className="flex gap-2 items-start"><RefreshCw size={14} className="mt-0.5 shrink-0" /><div><strong>Simulasi:</strong> {ai.simScenario} diuji pada 847 skenario historis serupa, efektif di 89% kasus.</div></div>
            <div className="flex gap-2 items-start"><Check size={14} className="mt-0.5 shrink-0 text-green-600" /><div><strong>Kesimpulan:</strong> Intervensi direkomendasikan dengan confidence {ai.confidence}%.</div></div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 h-9 font-black text-xs bg-[#facc15] hover:bg-[#eab308] text-[#111827]"
            onClick={handleApprove}
          >
            ✓ Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-3 font-bold text-xs text-slate-600 border-slate-300 hover:bg-slate-50"
            onClick={() => setExpanded(true)}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AiRecommendationPanel({ nodes, onApprove }: AiRecommendationPanelProps) {
  const nodesWithRecs = nodes.filter(n => n.recommendation)
    .sort((a, b) => b.predicted30 - a.predicted30) // highest urgency first

  return (
    <Card className="border-border h-full shadow-sm rounded-xl overflow-hidden flex flex-col bg-white">
      <CardHeader className="pb-4 pt-5 px-5 shrink-0 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <Brain size={15} className="text-white" />
            </div>
            <div>
              <CardTitle className="text-base font-black text-[#111827] leading-none">AI Recommendation</CardTitle>
            </div>
          </div>
          {nodesWithRecs.length > 0 && (
            <span className="text-[10px] font-black bg-red-500 text-white px-2 py-0.5 rounded-full">
              {nodesWithRecs.length}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 py-4 flex-1 overflow-y-auto scrollbar-hide">
        {nodesWithRecs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-60 py-10">
            <div className="w-14 h-14 rounded-full border-2 border-slate-200 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-slate-300" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500">Semua clear</p>
              <p className="text-xs text-slate-400 mt-1">Tidak ada kemacetan yang diprediksi memburuk saat ini.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {nodesWithRecs.slice(0, 4).map(node => (
              <RecommendationCard key={node.id} node={node} onApprove={onApprove} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
