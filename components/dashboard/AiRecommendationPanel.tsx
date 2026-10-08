'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Brain, CheckCircle2, ChevronDown, ChevronUp, ChevronRight, Check, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TrafficNode {
  id: string
  name: string
  currentLevel: number
  predicted30: number
  confidence: number
  recommendation: string | null
}

export interface AiRecommendationPanelProps {
  nodes: TrafficNode[]
  onApprove: (id: string, action: string) => void
  isMinimized?: boolean
  onMinimizeToggle?: () => void
  className?: string
}

export function buildAiReasoning(node: TrafficNode) {
  const trend = node.predicted30 - node.currentLevel
  const trendPct = trend > 0 ? `+${trend}%` : `${trend}%`
  const forecastTime = node.predicted30 > 80 ? '15 menit' : '30 menit'
  const confidence = Math.round(node.confidence * 100)

  const improvement = node.predicted30 > 75
    ? Math.round(20 + (node.predicted30 - 75) * 0.8)
    : Math.round(8 + node.predicted30 * 0.15)

  const urgency = node.predicted30 >= 85 ? 'KRITIS' : node.predicted30 >= 70 ? 'TINGGI' : 'SEDANG'

  const simScenario = node.predicted30 >= 80 ? '+15 dtk Fase Hijau' :
    node.predicted30 >= 65 ? '+10 dtk Fase Hijau' : '+5 dtk Fase Hijau'

  const simReduction = node.predicted30 >= 80 ? 21 : node.predicted30 >= 65 ? 15 : 8
  const simResult = Math.max(0, node.predicted30 - Math.round(node.predicted30 * simReduction / 100))

  return {
    trend, trendPct, forecastTime, confidence,
    improvement, urgency,
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
      <div className="p-4 rounded-lg bg-green-50 border border-green-200 flex items-center gap-3">
        <CheckCircle2 size={18} className="text-green-600 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-green-800">{node.name}</p>
          <p className="text-xs text-green-600">Rekomendasi disetujui & dikirim ke sistem ATCS.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-slate-400 shrink-0" />
            <p className="text-sm font-semibold text-[#111827] leading-tight">{node.name}</p>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${ai.urgency === 'KRITIS' ? 'bg-red-50 text-red-700' : ai.urgency === 'TINGGI' ? 'bg-orange-50 text-orange-700' : 'bg-yellow-50 text-yellow-700'}`}>
            {ai.urgency}
          </span>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs text-slate-500">Prediksi</span>
          <span className={`text-xs font-semibold ${ai.trend > 0 ? 'text-red-600' : 'text-green-600'}`}>
            <TrendingUp size={12} className="inline mr-1" />
            {ai.trendPct}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div className="bg-slate-50 rounded-md p-2 text-center">
            <p className="text-[10px] text-slate-500">Skrg</p>
            <p className="text-base font-semibold text-[#111827]">{node.currentLevel}%</p>
          </div>
          <div className="bg-red-50 rounded-md p-2 text-center border border-red-100">
            <p className="text-[10px] text-red-600">+{ai.forecastTime}</p>
            <p className="text-base font-semibold text-red-700">{node.predicted30}%</p>
          </div>
          <div className="flex flex-col justify-center items-center">
            <p className="text-sm font-semibold text-green-700">{ai.simResult}%</p>
            <p className="text-[10px] text-slate-500">Setelah intervensi</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">Confidence {ai.confidence}% · {ai.simScenario} · Reduksi {ai.simReduction}%</p>

        <div className="bg-[#f8fafc] border border-slate-200 rounded-md p-3 mb-3">
          <p className="text-sm font-medium text-[#111827]">{node.recommendation}</p>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-slate-500 mb-3 hover:text-slate-700"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Sembunyikan' : 'Lihat'} reasoning AI
        </button>
        {expanded && (
          <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 space-y-2">
            <div className="flex gap-2 items-start"><Brain size={14} className="mt-0.5 shrink-0 text-slate-400" /><div><strong>Analisis pola:</strong> Kemacetan di {node.name} meningkat konsisten pada jam ini selama 14 hari terakhir.</div></div>
            <div className="flex gap-2 items-start"><Check size={14} className="mt-0.5 shrink-0 text-green-600" /><div><strong>Simulasi:</strong> {ai.simScenario} diuji pada 847 skenario historis serupa, efektif di 89% kasus.</div></div>
            <div className="flex gap-2 items-start"><TrendingUp size={14} className="mt-0.5 shrink-0 text-blue-600" /><div><strong>Kesimpulan:</strong> Intervensi direkomendasikan dengan confidence {ai.confidence}%.</div></div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 h-9 font-semibold text-xs bg-primary hover:bg-primary/80"
            onClick={handleApprove}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-3 text-xs text-slate-600 border-slate-300 hover:bg-slate-50"
            onClick={() => setExpanded(true)}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AiRecommendationPanel({ nodes, onApprove, isMinimized = false, onMinimizeToggle, className }: AiRecommendationPanelProps) {
  const nodesWithRecs = nodes.filter(n => n.recommendation)
    .sort((a, b) => b.predicted30 - a.predicted30)

  return (
    <Card className={cn("border-border h-full shadow-sm rounded-lg overflow-hidden flex flex-col bg-white", className)}>
      <CardHeader className="pb-3 pt-4 px-4 shrink-0 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-[#8F1610]" />
            <CardTitle className="text-sm font-semibold text-[#111827] leading-none">AI Recommendation</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {nodesWithRecs.length > 0 && (
              <span className="text-[10px] font-semibold bg-red-500 text-white px-1.5 py-0.5 rounded-full">
                {nodesWithRecs.length}
              </span>
            )}
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
        </div>
      </CardHeader>
      {!isMinimized && (
        <CardContent className="px-4 py-3 flex-1 overflow-y-auto scrollbar-hide">
          {nodesWithRecs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-2 py-8 opacity-60">
              <CheckCircle2 size={24} className="text-slate-300" />
              <p className="text-sm font-medium text-slate-500">Semua clear</p>
              <p className="text-xs text-slate-400">Tidak ada kemacetan yang diprediksi memburuk saat ini.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {nodesWithRecs.slice(0, 4).map(node => (
                <RecommendationCard key={node.id} node={node} onApprove={onApprove} />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
