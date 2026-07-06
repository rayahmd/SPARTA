'use client'
import { Card, CardContent } from '@/components/ui/card'
import { LucideIcon } from 'lucide-react'

interface KpiCardProps {
  title: string
  value: string
  unit?: string
  icon: LucideIcon
  trend?: 'up' | 'down' | 'neutral'
  highlight?: boolean
}

export function KpiCard({ title, value, unit, icon: Icon, highlight }: KpiCardProps) {
  return (
    <Card className={`relative overflow-hidden transition-all duration-300 hover:shadow-lg ${
      highlight 
        ? 'border-primary bg-primary/5 shadow-primary/10 shadow-md' 
        : 'border-border hover:border-primary/30'
    }`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-3xl font-bold tracking-tight ${
                highlight ? 'text-primary' : 'text-foreground'
              }`}>
                {value}
              </span>
              {unit && (
                <span className="text-sm text-muted-foreground font-medium">{unit}</span>
              )}
            </div>
          </div>
          <div className={`p-2.5 rounded-lg ${
            highlight 
              ? 'bg-primary/10 text-primary' 
              : 'bg-secondary text-muted-foreground'
          }`}>
            <Icon size={22} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
