'use client'
import useSWR from 'swr'
import { DigitalTwinMap } from '@/components/dashboard/DigitalTwinMap'
import { Badge } from '@/components/ui/badge'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function LiveMapPage() {
  const { data: nodes = [] } = useSWR('/api/traffic-nodes', fetcher, { refreshInterval: 5000 })

  return (
    <div className="h-full flex flex-col bg-white rounded-xl shadow-sm border border-border p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-black text-[#111827]">Live Map Fullscreen</h2>
          <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50 text-xs font-bold uppercase">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse" />
            LIVE
          </Badge>
        </div>
      </div>
      <div className="flex-1 rounded-lg overflow-hidden border border-border relative">
        <DigitalTwinMap nodes={nodes} onNodeSelect={() => {}} />
      </div>
    </div>
  )
}
