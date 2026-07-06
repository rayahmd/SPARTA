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
  { name: 'Simulation', href: '/ephor/simulation', icon: Activity },
  { name: 'Traffic Light', href: '/ephor/traffic-light', icon: TrafficCone },
  { name: 'CCTV', href: '/ephor/cctv', icon: Video },
  { name: 'Pulse', href: '/ephor/pulse', icon: Radio },
  { name: 'Vanguard', href: '/ephor/vanguard', icon: Ambulance },
  { name: 'Analytics', href: '/ephor/analytics', icon: BarChart2 },
  { name: 'Event & Disaster', href: '/ephor/event-disaster', icon: AlertTriangle },
  { name: 'Reports', href: '/ephor/reports', icon: FileText },
  { name: 'Settings', href: '/ephor/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  if (pathname.includes('/hoplite')) return null;

  return (
    <div className="w-64 bg-[#1e293b] text-white flex flex-col h-full overflow-y-auto scrollbar-hide shrink-0 relative">
      <nav className="flex-1 py-6 space-y-1">
        {navItems.map((item) => {
          // Simplification for prototype to make sure "Dashboard" stays active
          const isActive = pathname === item.href || (item.name === 'Dashboard' && pathname === '/ephor')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-4 px-6 py-3.5 transition-colors ${
                isActive 
                  ? 'bg-transparent text-white font-bold border-l-4 border-l-transparent relative' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5 font-medium border-l-4 border-l-transparent'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-white rounded-r-sm"></div>
              )}
              <item.icon size={20} className={isActive ? "text-white" : "text-slate-400"} />
              <span className="text-sm">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-6 text-xs text-slate-500 font-medium">
        <p>SPARTA V2.5.1-AI</p>
        <p>Surabaya Smart City Initiative</p>
      </div>
    </div>
  )
}
