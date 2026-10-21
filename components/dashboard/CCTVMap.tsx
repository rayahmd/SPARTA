'use client'
import { useEffect, useRef, useState } from 'react'
import { renderToString } from 'react-dom/server'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { Video } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface CameraNode {
  id: string
  name: string
  lat: number
  lng: number
  currentLevel: number
}

interface CameraNode {
  id: string
  name: string
  lat: number
  lng: number
  currentLevel: number
}

function createCctvIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="background:#1e293b;border:2px solid white;border-radius:10px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 18px rgba(0,0,0,0.24);">${renderToString(
      <Video size={18} color="white" />
    )}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -38],
  })
}

// Komponen kecil yang "duduk" di dalam MapContainer, tugasnya cuma
// mastiin Leaflet re-ukur dirinya sendiri begitu container punya ukuran final,
// dan setiap kali container berubah ukuran (resize window, sidebar toggle, dll).
function MapResizeHandler() {
  const map = useMap()
  const containerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    // Fix ukuran begitu mount (atasi masalah container 0px saat init)
    const t = setTimeout(() => map.invalidateSize(), 0)

    const container = map.getContainer()
    containerRef.current = container

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize()
    })
    resizeObserver.observe(container)

    return () => {
      clearTimeout(t)
      resizeObserver.disconnect()
    }
  }, [map])

  return null
}

export function CCTVMap({ nodes }: { nodes: CameraNode[] }) {
  // Modul ini hanya dimuat di client (dynamic import, ssr: false), jadi ikon
  // Leaflet aman dibuat saat state pertama kali diinisialisasi.
  const [cctvIcon] = useState<L.DivIcon>(createCctvIcon)
  const center: [number, number] = nodes.length > 0
    ? [nodes[0].lat, nodes[0].lng]
    : [-7.2458, 112.7378]

  return (
    <MapContainer
      center={center}
      zoom={12}
      scrollWheelZoom={true}
      style={{ height: '100%', width: '100%', backgroundColor: 'transparent' }}
      className="bg-transparent"
    >
      <MapResizeHandler />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {nodes.map((node) => (
        <Marker
          key={node.id}
          position={[node.lat, node.lng]}
          icon={cctvIcon}
        >
          <Popup>
            <div className="space-y-1 text-sm">
              <p className="font-bold text-slate-900">{node.name}</p>
              <p className="text-xs text-slate-500">ID SITS-{String(node.id).padStart(4, '0')}</p>
              <p className="text-xs text-slate-500">Status: {node.currentLevel < 80 ? 'Online' : 'Tinggi'}</p>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}