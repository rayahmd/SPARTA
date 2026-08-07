'use client'
import { Bell, Clock, Calendar, User, MapPin, LogOut, Settings as SettingsIcon, Menu } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const [time, setTime] = useState<Date | null>(null)
  const pathname = usePathname()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfile(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      clearInterval(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  if (pathname.includes('/hoplite')) return null;

  return (
    <header className="h-[64px] bg-white border-b border-[#e5e7eb] flex items-center justify-between px-6 z-20 shrink-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>
        <Image src="/sparta.png" alt="SPARTA Logo" width={40} height={40} className="rounded-full" />
        <div>
          <h1 className="text-lg font-bold tracking-tight text-[#111827] leading-none mb-0.5">SPARTA EPHOR</h1>
          <p className="text-[10px] text-[#6B7280] font-medium uppercase tracking-wider">Surabaya Traffic Command Center</p>
        </div>
      </div>

      <div className="flex items-center gap-6">
          <div className="flex flex-col items-end border-r border-[#e5e7eb] pr-6">
            <div className="flex items-center gap-2 text-[#111827] font-semibold">
              <span>{time ? time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '...'}</span>
            </div>
            <div className="text-[11px] text-[#6B7280]">
              <span>{time ? time.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '...'}</span>
            </div>
          </div>

        <div className="flex items-center gap-4">
          <div className="relative" ref={notifRef}>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 text-[#6B7280] hover:bg-slate-100 rounded-full transition-colors"
            >
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-[#dc2626] rounded-full"></span>
            </button>
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-[#e5e7eb] overflow-hidden z-50">
                <div className="p-3 border-b border-[#e5e7eb] bg-slate-50 flex justify-between items-center">
                  <span className="font-semibold text-[#111827]">Notifikasi</span>
                  <span className="text-xs text-blue-600 cursor-pointer font-bold">Tandai sudah dibaca</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {[1, 2, 3].map((_, i) => (
                    <div key={i} className="p-3 border-b border-[#e5e7eb] hover:bg-slate-50 cursor-pointer">
                      <p className="text-sm font-medium text-[#111827]">Laporan Insiden Baru</p>
                      <p className="text-xs text-slate-500">Masyarakat melaporkan genangan air di Jl. Raya Darmo.</p>
                      <p className="text-[10px] text-slate-400 mt-1">{i * 5 + 2} menit yang lalu</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="relative" ref={profileRef}>
            <div 
              className="flex items-center gap-3 pl-2 border-l border-[#e5e7eb] ml-2 cursor-pointer hover:opacity-80"
              onClick={() => setShowProfile(!showProfile)}
            >
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold leading-none text-[#111827]">Operator 1</p>
                <p className="text-xs text-[#6B7280] mt-1">ATCS Surabaya</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 border border-[#e5e7eb]">
                <User size={20} />
              </div>
            </div>
            
            {showProfile && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-[#e5e7eb] overflow-hidden z-50">
                <div className="p-1">
                  <Link href="/ephor/settings" onClick={() => setShowProfile(false)} className="flex items-center gap-2 p-2 px-3 text-sm hover:bg-slate-50 rounded-lg text-slate-700 font-medium">
                    <SettingsIcon size={16} /> Pengaturan
                  </Link>
                  <div className="h-px bg-slate-100 my-1"></div>
                  <button className="w-full flex items-center gap-2 p-2 px-3 text-sm hover:bg-red-50 text-red-600 rounded-lg font-medium text-left">
                    <LogOut size={16} /> Keluar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
