// Skenario demo deterministik untuk rekaman video: koridor tiga simpang
// (hulu U, tengah A, hilir B) dari data simpang yang sudah ada, seed tetap.
// Urutan yang diharapkan (lihat __tests__/scenario.test.ts):
//   A menerapkan +15 dtk hijau → notice ke B dan U → B geser offset (accept)
//   → U kurangi pelepasan ke A (adjust) → gelombang berhenti di batas maxHops.

import { angleDiff, bearingDeg, type AgentGraph } from "./graph";
import type { IntersectionInfo } from "./types";

export const CORRIDOR_SCENARIO = {
  name: "koridor",
  seed: 20261018,
  /** Prediksi kepadatan simpang lain: tenang, agent tidak memicu perubahan sendiri. */
  calmForecast: 35,
  /** Prediksi kepadatan simpang tengah A (output model prediksi untuk demo). */
  centerForecast: 92,
  /** Keputusan pertama A, detik setelah skenario dimulai. */
  decisionAtSec: 3,
  /** Pemanasan twin sebelum jam skenario dimulai, supaya antrean sudah terbentuk. */
  warmupSec: 300,
  /**
   * Offset koordinasi awal (dtk) simpang hilir yang belum sinkron dengan
   * rombongan dari A. Data demo; dipilih supaya B perlu menggeser offset.
   */
  downstreamOffsetSec: 28,
  match: { upstream: /tunjungan/i, center: /pemuda/i, downstream: /gubeng/i },
} as const;

export interface Corridor {
  upstream: IntersectionInfo;
  center: IntersectionInfo;
  downstream: IntersectionInfo;
}

/** Koridor demo: berdasarkan nama bila ada, bila tidak simpang dengan dua tetangga berseberangan. */
export function findCorridor(intersections: IntersectionInfo[], graph: AgentGraph): Corridor | null {
  const byName = (re: RegExp) => intersections.find((n) => re.test(n.name));
  const { upstream, center, downstream } = CORRIDOR_SCENARIO.match;
  const u = byName(upstream);
  const a = byName(center);
  const b = byName(downstream);
  const linked = (x: IntersectionInfo, y: IntersectionInfo) =>
    (graph.neighbors.get(x.id) ?? []).some((l) => l.id === y.id);
  if (u && a && b && linked(u, a) && linked(a, b)) return { upstream: u, center: a, downstream: b };

  const sorted = intersections.slice().sort((x, y) => (x.id < y.id ? -1 : 1));
  for (const node of sorted) {
    const links = graph.neighbors.get(node.id) ?? [];
    for (let i = 0; i < links.length; i++) {
      for (let j = i + 1; j < links.length; j++) {
        if (angleDiff(links[i].bearingDeg, links[j].bearingDeg) >= 120) {
          return {
            upstream: graph.nodes.get(links[i].id)!,
            center: node,
            downstream: graph.nodes.get(links[j].id)!,
          };
        }
      }
    }
  }
  return null;
}

/** Arah lengan A yang menghadap U: pendekat yang dibebani rombongan dari hulu. */
export function hotBearingFor(corridor: Corridor): number {
  return bearingDeg(corridor.center, corridor.upstream);
}
