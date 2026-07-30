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
  const [route, setRoute] = useState<VehicleRoute | null>(null)
  const cacheRef = useRef<Map<string, VehicleRoute>>(new Map())

  useEffect(() => {
    if (!vehicle) {
      setRoute(null)
      return
    }

    const { id, originLat, originLng, destLat, destLng } = vehicle
    const cacheKey = `${originLat},${originLng};${destLat},${destLng}`

    const cachedRoute = cacheRef.current.get(cacheKey)
    if (cachedRoute) {
      setRoute(cachedRoute)
      return
    }

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
        setRoute(vehicleRoute)
      } else {
        setRoute({
          vehicleId: id,
          geometry: [[originLat, originLng], [destLat, destLng]],
          distance: Math.sqrt(Math.pow(destLat - originLat, 2) + Math.pow(destLng - originLng, 2)) * 111,
          duration: 0,
        })
      }
    }).catch(() => {
      setRoute({
        vehicleId: id,
        geometry: [[originLat, originLng], [destLat, destLng]],
        distance: Math.sqrt(Math.pow(destLat - originLat, 2) + Math.pow(destLng - originLng, 2)) * 111,
        duration: 0,
      })
    })
  }, [vehicle?.id, vehicle?.originLat, vehicle?.originLng, vehicle?.destLat, vehicle?.destLng])

  return route
}
