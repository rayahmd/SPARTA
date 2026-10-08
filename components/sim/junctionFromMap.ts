import type { Map as MapLibreMap } from "maplibre-gl";
import { detectJunction } from "@/lib/sim/junction";
import type { RoadLine } from "@/lib/sim/junction";
import type { DetectedArm } from "@/lib/sim/types";

// Source vektor basemap (skema OpenMapTiles), lihat lib/config/map.ts.
const ROAD_SOURCE = "openmaptiles";
const ROAD_SOURCE_LAYER = "transportation";

/**
 * Membaca bentuk simpang di sekitar sebuah node dari data jalan yang sedang
 * dimuat peta. Jalan layang dan terowongan dilewati karena tidak ikut diatur
 * lampu di simpang itu. Mengembalikan null bila data jalan belum termuat atau
 * tidak membentuk simpang; pemanggil lalu memakai bentuk default.
 */
export function detectJunctionFromMap(
  map: Pick<MapLibreMap, "querySourceFeatures">,
  node: { lat: number; lng: number },
): DetectedArm[] | null {
  try {
    const features = map.querySourceFeatures(ROAD_SOURCE, {
      sourceLayer: ROAD_SOURCE_LAYER,
    });
    const roads: RoadLine[] = [];
    for (const feature of features) {
      const props = feature.properties ?? {};
      const roadClass = typeof props.class === "string" ? props.class : "";
      if (!roadClass || props.brunnel === "bridge" || props.brunnel === "tunnel") {
        continue;
      }
      const geometry = feature.geometry;
      if (geometry.type === "LineString") {
        roads.push({ coords: geometry.coordinates as [number, number][], roadClass });
      } else if (geometry.type === "MultiLineString") {
        for (const line of geometry.coordinates) {
          roads.push({ coords: line as [number, number][], roadClass });
        }
      }
    }
    return detectJunction(node, roads)?.arms ?? null;
  } catch {
    return null;
  }
}
