'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Map, TrendingUp, TrafficCone,
  Radio, Ambulance, BarChart2, AlertTriangle, FileText, Settings
} from 'lucide-react'
import Image from 'next/image'
import { SHOW_PREDICTION_UI, SHOW_TRAFFIC_LIGHT_MENU } from '@/lib/config/features'

const navItems = [
  { name: 'Dashboard', href: '/ephor', icon: LayoutDashboard },
  { name: 'Live Map', href: '/ephor/live-map', icon: Map },
  { name: 'Prediction', href: '/ephor/prediction', icon: TrendingUp },
  { name: 'Traffic Light', href: '/ephor/traffic-light', icon: TrafficCone },
  { name: 'Pulse', href: '/ephor/pulse', icon: Radio },
  { name: 'Vanguard', href: '/ephor/vanguard', icon: Ambulance },
  { name: 'Analytics', href: '/ephor/analytics', icon: BarChart2 },
  { name: 'Event & Disaster', href: '/ephor/event-disaster', icon: AlertTriangle },
  { name: 'Reports', href: '/ephor/reports', icon: FileText },
  { name: 'Settings', href: '/ephor/settings', icon: Settings },
].filter((item) => SHOW_PREDICTION_UI || item.href !== '/ephor/prediction')
  .filter((item) => SHOW_TRAFFIC_LIGHT_MENU || item.href !== '/ephor/traffic-light')

export function Sidebar() {
  const pathname = usePathname()

  if (pathname.includes('/hoplite')) return null

  return (
    <div className="w-72 bg-gradient-to-b from-[#722030] to-[#3f0e16] text-white flex flex-col h-full overflow-y-auto scrollbar-hide shrink-0 relative border-r border-black/20">

      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0">
            <Image src="/sparta.png" alt="SPARTA Logo" width={40} height={40} className="rounded-lg" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/70 leading-none">
              Sparta
            </p>
            <p className="text-[15px] font-bold text-white leading-tight mt-1">EPHOR</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || (item.name === 'Dashboard' && pathname === '/ephor')
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] transition-all
                ${isActive
                  ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-[#3a2c08] font-semibold shadow-[0_6px_14px_-6px_rgba(201,162,39,0.55)]'
                  : 'text-white/70 font-medium hover:bg-white/[0.06] hover:text-white'
                }`}
            >
              <item.icon
                size={17}
                strokeWidth={2}
                className={isActive ? 'text-[#3a2c08]' : 'text-white/60 group-hover:text-white'}
              />
              <span>{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/10 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-wide text-white/35">
          SPARTA v1.0 BETA
        </span>
      </div>
    </div>
  )
}