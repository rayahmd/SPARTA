'use client'
import { Bell, Clock, Calendar, User, MapPin, LogOut, Settings as SettingsIcon } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

export function Topbar() {
  const [time, setTime] = useState<Date | null>(null)
  const pathname = usePathname()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTime(new Date())
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
    <header className="h-[72px] bg-white border-b border-border flex items-center justify-between px-6 z-20 shrink-0">
      <div className="flex items-center gap-3">
        <div className="bg-[#facc15] text-[#111827] p-2.5 rounded-xl">
          <MapPin size={22} className="fill-[#111827]" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight text-[#111827] leading-none mb-1">SPARTA EPHOR</h1>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Surabaya Traffic Command Center</p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end border-r border-border pr-6">
          <div className="flex items-center gap-2 text-[#111827] font-bold">
            <span>{time ? time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '...'}</span>
          </div>
          <div className="text-[11px] text-muted-foreground font-medium">
            <span>{time ? time.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '...'}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative" ref={notifRef}>
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
            >
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full"></span>
            </button>
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-border overflow-hidden z-50">
                <div className="p-3 border-b border-border bg-slate-50 flex justify-between items-center">
                  <span className="font-bold text-[#111827]">Notifikasi</span>
                  <span className="text-xs text-blue-600 cursor-pointer font-bold">Tandai sudah dibaca</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {[1, 2, 3].map((_, i) => (
                    <div key={i} className="p-3 border-b border-border hover:bg-slate-50 cursor-pointer">
                      <p className="text-sm font-bold text-[#111827]">Laporan Insiden Baru</p>
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
              className="flex items-center gap-3 pl-2 border-l border-border ml-2 cursor-pointer hover:opacity-80"
              onClick={() => setShowProfile(!showProfile)}
            >
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold leading-none text-[#111827]">Operator 1</p>
                <p className="text-xs text-muted-foreground mt-1">ATCS Surabaya</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground border border-border">
                <User size={20} />
              </div>
            </div>
            
            {showProfile && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-border overflow-hidden z-50">
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
