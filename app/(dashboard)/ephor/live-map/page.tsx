'use client'
import useSWR from 'swr'
import { DigitalTwinMap } from '@/components/dashboard/DigitalTwinMap'
import { Badge } from '@/components/ui/badge'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function LiveMapPage() {
  const { data: nodes = [] } = useSWR('/api/traffic-nodes', fetcher, { refreshInterval: 5000 })

  return (
    <div className="relative -m-6 h-[calc(100vh-64px)] overflow-hidden">
      <DigitalTwinMap nodes={nodes} onNodeSelect={() => {}} />
    </div>
  )
}
