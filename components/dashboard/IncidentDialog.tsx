'use client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

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

interface IncidentDialogProps {
  node: TrafficNode | null
  open: boolean
  onClose: () => void
  onApprove: (id: string, action: string) => void
}

function getColor(level: number): string {
  if (level < 40) return '#22c55e'
  if (level < 70) return '#eab308'
  return '#ef4444'
}

export function IncidentDialog({ node, open, onClose, onApprove }: IncidentDialogProps) {
  if (!node) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {node.name}
            <Badge
              className="text-[10px]"
              style={{ backgroundColor: getColor(node.currentLevel), color: 'white' }}
            >
              {node.currentLevel >= 70 ? 'TINGGI' : node.currentLevel >= 40 ? 'SEDANG' : 'RENDAH'}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Detail kondisi lalu lintas persimpangan
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Tingkat Kemacetan Saat Ini</span>
              <span className="text-lg font-bold" style={{ color: getColor(node.currentLevel) }}>
                {node.currentLevel}%
              </span>
            </div>
            <Progress value={node.currentLevel} className="h-2" />
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Prediksi 30 Menit ke Depan</span>
              <span className="text-lg font-bold" style={{ color: getColor(node.predicted30) }}>
                {node.predicted30}%
              </span>
            </div>
            <Progress value={node.predicted30} className="h-2" />
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Confidence</span>
            <span className="text-lg font-bold text-blue-600">
              {(node.confidence * 100).toFixed(0)}%
            </span>
          </div>

          {node.recommendation && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Rekomendasi AI</p>
              <p className="text-sm font-bold text-primary">{node.recommendation}</p>
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>Perkiraan Perbaikan</span>
                <span className="font-medium text-foreground">{Math.floor(Math.random() * 20 + 10)}%</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              onClick={() => { onApprove(node.id, 'approve'); onClose(); }}
            >
              Approve
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => { onApprove(node.id, 'adjust'); onClose(); }}
            >
              Adjust
            </Button>
            <Button
              variant="outline"
              className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => { onApprove(node.id, 'reject'); onClose(); }}
            >
              Reject
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
