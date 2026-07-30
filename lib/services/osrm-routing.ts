export interface RouteResponse {
  geometry: [number, number][]
  waypoints: [number, number][]
  distance: number
  duration: number
  weight: number
}

export interface OSRMRoute {
  geometry: {
    coordinates: [number, number][]
  }
  distance: number
  duration: number
  weight: number
}

export interface OSRMResponse {
  code: string
  routes: OSRMRoute[]
  waypoints: Array<{
    location: [number, number]
    name: string
  }>
}

export class OSRMRoutingService {
  private baseUrl: string
  private cache: Map<string, RouteResponse> = new Map()
  private readonly cacheTimeout = 5 * 60 * 1000

  constructor(baseUrl: string = 'https://router.project-osrm.org') {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  }

  async getRoute(
    start: [number, number],
    destination: [number, number],
    profile: 'driving' | 'walking' | 'cycling' = 'driving',
    options?: {
      alternatives?: number
      steps?: boolean
      geometries?: 'geojson' | 'polyline' | 'polyline6'
    }
  ): Promise<RouteResponse | null> {
    const cacheKey = `${start[0]},${start[1]};${destination[0]},${destination[1]};${profile}`
    
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const coords = `${start[1]},${start[0]};${destination[1]},${destination[0]}`
      const params = new URLSearchParams({
        overview: 'full',
        geometries: options?.geometries || 'geojson',
        steps: options?.steps ? 'true' : 'false'
      })
      
      if (options?.alternatives) {
        params.set('alternatives', options.alternatives.toString())
      }

      const url = `${this.baseUrl}/route/v1/${profile}/${coords}?${params.toString()}`
      
      const response = await fetch(url)
      if (!response.ok) {
        console.error('OSRM route request failed:', response.status)
        return null
      }

      const data: OSRMResponse = await response.json()
      
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        console.error('OSRM returned no routes')
        return null
      }

      const route = data.routes[0]
      const geometry = route.geometry.coordinates.map(coord => [coord[1], coord[0]] as [number, number])

      const routeResponse: RouteResponse = {
        geometry,
        waypoints: data.waypoints.map(wp => [wp.location[1], wp.location[0]] as [number, number]),
        distance: route.distance,
        duration: route.duration,
        weight: route.weight || route.duration,
      }

      this.cache.set(cacheKey, routeResponse)
      
      return routeResponse
    } catch (error) {
      console.error('Failed to fetch OSRM route:', error)
      return null
    }
  }

  clearCache(): void {
    this.cache.clear()
  }
}
