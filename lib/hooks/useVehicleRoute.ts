import { useState, useEffect, useRef } from 'react'
import { OSRMRoutingService } from '@/lib/services/osrm-routing'

interface EmergencyVehicle {
  id: string
  originLat: number
  originLng: number
  destLat: number
  destLng: number
}

export interface VehicleRoute {
  vehicleId: string
  geometry: [number, number][]
  distance: number
  duration: number
}

const osrmService = new OSRMRoutingService()

export function useVehicleRoute(vehicle: EmergencyVehicle | null): VehicleRoute | null {
  // Rute disimpan per pasangan asal-tujuan; rute aktif diturunkan saat render
  // supaya effect hanya menyetel state dari callback fetch.
  const [routes, setRoutes] = useState<Record<string, VehicleRoute>>({})
  const cacheRef = useRef<Map<string, VehicleRoute>>(new Map())
  const routeKey = vehicle
    ? `${vehicle.originLat},${vehicle.originLng};${vehicle.destLat},${vehicle.destLng}`
    : null

  useEffect(() => {
    if (!vehicle) return
    const setRoute = (key: string, value: VehicleRoute) =>
      setRoutes(prev => ({ ...prev, [key]: value }))

    const { id, originLat, originLng, destLat, destLng } = vehicle
    const cacheKey = `${originLat},${originLng};${destLat},${destLng}`
    if (cacheRef.current.has(cacheKey)) return

    osrmService.getRoute(
      [originLat, originLng],
      [destLat, destLng],
      'driving',
      { alternatives: 0, steps: false, geometries: 'geojson' }
    ).then(routeResponse => {
      if (routeResponse) {
        const vehicleRoute: VehicleRoute = {
          vehicleId: id,
          geometry: routeResponse.geometry,
          distance: routeResponse.distance / 1000,
          duration: routeResponse.duration / 60,
        }
        cacheRef.current.set(cacheKey, vehicleRoute)
        setRoute(cacheKey, vehicleRoute)
      } else {
        setRoute(cacheKey, {
          vehicleId: id,
          geometry: [[originLat, originLng], [destLat, destLng]],
          distance: Math.sqrt(Math.pow(destLat - originLat, 2) + Math.pow(destLng - originLng, 2)) * 111,
          duration: 0,
        })
      }
    }).catch(() => {
      setRoute(cacheKey, {
        vehicleId: id,
        geometry: [[originLat, originLng], [destLat, destLng]],
        distance: Math.sqrt(Math.pow(destLat - originLat, 2) + Math.pow(destLng - originLng, 2)) * 111,
        duration: 0,
      })
    })
  }, [vehicle?.id, vehicle?.originLat, vehicle?.originLng, vehicle?.destLat, vehicle?.destLng])

  return routeKey ? routes[routeKey] ?? null : null
}
