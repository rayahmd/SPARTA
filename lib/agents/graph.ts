// Graf tetangga antar simpang dari koordinat yang sudah ada. Dua simpang
// bertetangga bila salah satunya termasuk `kNearest` terdekat yang lain dalam
// `neighborRadiusM`. Simpang tanpa tetangga dalam radius dihubungkan ke satu
// simpang terdekatnya supaya tidak ada agent yang terisolasi (dan heartbeat
// tetap punya pendengar).

import type { AgentConfig } from "./config";
import type { GraphEdge, IntersectionInfo } from "./types";

const EARTH_RADIUS_M = 6371000;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Arah dari `a` ke `b`: 0 = utara, searah jarum jam. */
export function bearingDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Selisih sudut terkecil (0..180). */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

export interface NeighborLink {
  id: string;
  distanceM: number;
  travelTimeSec: number;
  /** Arah dari simpang ini ke tetangga. */
  bearingDeg: number;
}

export interface AgentGraph {
  nodes: Map<string, IntersectionInfo>;
  neighbors: Map<string, NeighborLink[]>;
  edges: GraphEdge[];
}

export function buildGraph(
  intersections: IntersectionInfo[],
  cfg: Pick<AgentConfig, "neighborRadiusM" | "kNearest" | "platoonSpeedMps">,
): AgentGraph {
  // Urut id supaya hasil tidak bergantung urutan baris dari database.
  const list = intersections.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pairs = new Map<string, GraphEdge>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const addEdge = (a: IntersectionInfo, b: IntersectionInfo, distanceM: number) => {
    const k = key(a.id, b.id);
    if (pairs.has(k)) return;
    const [first, second] = a.id < b.id ? [a, b] : [b, a];
    pairs.set(k, {
      a: first.id,
      b: second.id,
      distanceM: Math.round(distanceM),
      travelTimeSec: Math.round(distanceM / cfg.platoonSpeedMps),
    });
  };

  for (const node of list) {
    const ranked = list
      .filter((other) => other.id !== node.id)
      .map((other) => ({ other, d: haversineM(node, other) }))
      .sort((x, y) => x.d - y.d || (x.other.id < y.other.id ? -1 : 1));
    const inRadius = ranked.filter((r) => r.d <= cfg.neighborRadiusM).slice(0, cfg.kNearest);
    const chosen = inRadius.length > 0 ? inRadius : ranked.slice(0, 1);
    for (const { other, d } of chosen) addEdge(node, other, d);
  }

  const nodes = new Map(list.map((n) => [n.id, n]));
  const neighbors = new Map<string, NeighborLink[]>(list.map((n) => [n.id, []]));
  const edges = [...pairs.values()].sort((x, y) => (x.a + x.b < y.a + y.b ? -1 : 1));
  for (const edge of edges) {
    const a = nodes.get(edge.a)!;
    const b = nodes.get(edge.b)!;
    neighbors.get(a.id)!.push({ id: b.id, distanceM: edge.distanceM, travelTimeSec: edge.travelTimeSec, bearingDeg: bearingDeg(a, b) });
    neighbors.get(b.id)!.push({ id: a.id, distanceM: edge.distanceM, travelTimeSec: edge.travelTimeSec, bearingDeg: bearingDeg(b, a) });
  }
  for (const links of neighbors.values()) links.sort((x, y) => x.distanceM - y.distanceM || (x.id < y.id ? -1 : 1));
  return { nodes, neighbors, edges };
}
