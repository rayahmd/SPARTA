'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, Map, TrendingUp, Activity, TrafficCone,
  Video, Radio, Ambulance, BarChart2, AlertTriangle, FileText, Settings, ShieldAlert
} from 'lucide-react'

const navItems = [
  { name: 'Dashboard', href: '/ephor', icon: LayoutDashboard },
  { name: 'Live Map', href: '/ephor/live-map', icon: Map },
  { name: 'Prediction', href: '/ephor/prediction', icon: TrendingUp },
  // { name: 'Simulation', href: '/ephor/simulation', icon: Activity },
  { name: 'Traffic Light', href: '/ephor/traffic-light', icon: TrafficCone },
  // { name: 'CCTV', href: '/ephor/cctv', icon: Video },
  { name: 'Pulse', href: '/ephor/pulse', icon: Radio },
  { name: 'Vanguard', href: '/ephor/vanguard', icon: Ambulance },
  { name: 'Analytics', href: '/ephor/analytics', icon: BarChart2 },
  { name: 'Event & Disaster', href: '/ephor/event-disaster', icon: AlertTriangle },
  { name: 'Reports', href: '/ephor/reports', icon: FileText },
  { name: 'Settings', href: '/ephor/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  if (pathname.includes('/hoplite')) return null

  return (
    <div className="w-64 bg-[#111827] text-white flex flex-col h-full overflow-y-auto scrollbar-hide shrink-0 relative border-r border-slate-700">
      <nav className="flex-1 py-6 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.name === 'Dashboard' && pathname === '/ephor')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={
                `flex items-center gap-4 px-6 py-3.5 transition-all duration-200 border-l-4 ${isActive
                  ? 'border-l-[#8F1610] bg-[#8F1610]/10 text-[#8F1610] font-semibold'
                  : 'border-l-transparent text-slate-400 hover:text-white hover:bg-white/5 font-medium'}`
              }
            >
              <item.icon size={20} className={isActive ? "text-[#8F1610]" : "text-slate-400"} />
              <span className="text-sm">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-6 text-xs text-slate-500 font-medium border-t border-slate-700">
        <p className="text-[#8F1610] font-bold">SPARTA V1.0 BETA</p>
      </div>
    </div>
  )
}
