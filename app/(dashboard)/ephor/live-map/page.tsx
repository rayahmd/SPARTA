'use client'
import { useState, useSyncExternalStore } from 'react'
import useSWR from 'swr'
import { AgentActivityChip, AgentActivityPanel } from '@/components/dashboard/AgentActivityPanel'
import { DigitalTwinMap } from '@/components/dashboard/DigitalTwinMap'
import { useAgents } from '@/lib/hooks/useAgents'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const GLASS = 'border border-white/70 bg-white/85 shadow-lg backdrop-blur-md'

// Di layar sempit (<1024px) panel default tertutup supaya peta tidak tertutup.
const NARROW_QUERY = '(max-width: 1023px)'
function subscribeNarrow(onChange: () => void) {
  const media = window.matchMedia(NARROW_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const getNarrow = () => window.matchMedia(NARROW_QUERY).matches
const getNarrowOnServer = () => false

export default function LiveMapPage() {
  const { data: nodes = [] } = useSWR('/api/traffic-nodes', fetcher, { refreshInterval: 5000 })
  const agents = useAgents()
  // null = ikuti default (terbuka di layar lebar, tertutup di layar sempit)
  const [panelPref, setPanelPref] = useState<boolean | null>(null)
  const isNarrow = useSyncExternalStore(subscribeNarrow, getNarrow, getNarrowOnServer)
  const panelOpen = panelPref ?? !isNarrow

  return (
    <div className="relative isolate -m-6 h-screen overflow-hidden">
      <DigitalTwinMap
        nodes={nodes}
        onNodeSelect={() => {}}
        agents={agents.snapshot}
        agentEvents={agents.events}
        focusPadding={{ right: panelOpen && !isNarrow ? 408 : 16 }}
        showHorizonBar
      />
      {/* Panel floating di atas peta; container tidak menangkap pointer. */}
      <div className="pointer-events-none absolute bottom-12 right-3 top-3 z-[850] flex w-[380px] max-w-[calc(100%-1.5rem)] flex-col items-end">
        {panelOpen ? (
          <div className="flex min-h-0 w-full flex-1 flex-col">
            <AgentActivityPanel
              agents={agents}
              onMinimizeToggle={() => setPanelPref(false)}
              className={`pointer-events-auto h-auto max-h-full rounded-2xl ${GLASS}`}
            />
          </div>
        ) : (
          <AgentActivityChip
            agents={agents}
            onOpen={() => setPanelPref(true)}
            className={`pointer-events-auto inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-[#111827] transition-colors hover:bg-white ${GLASS}`}
          />
        )}
      </div>
    </div>
  )
}
