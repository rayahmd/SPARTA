// Membaca bentuk simpang (jumlah lengan dan arahnya) dari garis jalan di
// sekitar sebuah titik. TypeScript murni: masukannya garis jalan dalam
// lng/lat (mis. dari vector tile OpenStreetMap yang sedang tampil di peta).
//
// Cara kerja: jalan yang melewati titik pusat diikuti sampai memotong
// lingkaran berjari-jari RING_RADIUS_M; tiap titik potong memberi satu arah.
// Arah yang berdekatan digabung jadi satu lengan, sehingga jalan dua jalur
// terpisah (dua garis sejajar) tetap terhitung satu lengan.
//
// Ini heuristik. Koordinat node sering meleset beberapa puluh meter dari
// simpang sebenarnya, jadi pusat digeser ke titik terdekat yang paling
// menyerupai simpang. Hasilnya bisa keliru di simpang yang rumit (bundaran,
// flyover, jalan kecil yang tidak ada di tile), dan pemanggil harus siap
// memakai bentuk default bila fungsi ini mengembalikan null.

import type { DetectedArm } from "./types";

export interface RoadLine {
  /** Titik-titik garis jalan sebagai [lng, lat]. */
  coords: [number, number][];
  /** Kelas jalan OpenMapTiles: trunk, primary, secondary, tertiary, minor, ... */
  roadClass: string;
}

export interface JunctionResult {
  arms: DetectedArm[];
  /** Pusat simpang yang dipakai, dan jaraknya dari titik yang diminta. */
  center: { lat: number; lng: number };
  offsetM: number;
}

const CLASS_RANK: Record<string, number> = {
  trunk: 4,
  primary: 3,
  secondary: 2,
  tertiary: 1,
  minor: 0,
};
const MAJOR_CLASSES = new Set(["trunk", "primary", "secondary", "tertiary"]);

/** Seberapa jauh pusat simpang boleh digeser dari koordinat node (jalan utama). */
const SEARCH_RADIUS_M = 160;
/** Radius pencarian bila jalan kecil ikut dihitung sebagai lengan. */
const MIXED_RADIUS_M = 90;
/** Satu lengan tambahan setara dengan simpang yang 40 m lebih dekat. */
const DISTANCE_PENALTY_PER_M = 2.5;
const RING_RADIUS_M = 55;
/** Jalan dianggap melewati simpang bila sedekat ini dari pusat. */
const NEAR_RADIUS_M = 22;
/** Dua garis dianggap tersambung bila ujungnya sedekat ini. */
const LINK_TOLERANCE_M = 4;
/** Arah yang selisihnya di bawah ini digabung jadi satu lengan. */
const MERGE_DEG = 30;
const MIN_ARMS = 3;
const MAX_ARMS = 5;

interface Pt {
  x: number;
  y: number;
}
interface Line {
  pts: Pt[];
  rank: number;
  roadClass: string;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function distToLine(p: Pt, line: Line): number {
  let min = Infinity;
  for (let i = 1; i < line.pts.length; i++) {
    const d = distToSegment(p, line.pts[i - 1], line.pts[i]);
    if (d < min) min = d;
  }
  return min;
}

function segmentIntersection(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + rx * t, y: a.y + ry * t };
}

/** Arah (0 = utara, searah jarum jam) tempat sebuah garis memotong lingkaran. */
function ringCrossings(center: Pt, line: Line, radius: number, out: number[]): void {
  for (let i = 1; i < line.pts.length; i++) {
    const ax = line.pts[i - 1].x - center.x;
    const ay = line.pts[i - 1].y - center.y;
    const dx = line.pts[i].x - line.pts[i - 1].x;
    const dy = line.pts[i].y - line.pts[i - 1].y;
    const a = dx * dx + dy * dy;
    if (a === 0) continue;
    const b = 2 * (ax * dx + ay * dy);
    const c = ax * ax + ay * ay - radius * radius;
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const root = Math.sqrt(disc);
    for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
      if (t < 0 || t > 1) continue;
      const px = ax + dx * t;
      const py = ay + dy * t;
      out.push(((Math.atan2(px, py) * 180) / Math.PI + 360) % 360);
    }
  }
}

interface ArmCluster {
  bearingDeg: number;
  rank: number;
  roadClass: string;
  carriageways: number;
}

function clusterBearings(
  crossings: { bearing: number; rank: number; roadClass: string }[],
): ArmCluster[] {
  if (crossings.length === 0) return [];
  const sorted = crossings.slice().sort((a, b) => a.bearing - b.bearing);
  const groups: (typeof sorted)[] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const group = groups[groups.length - 1];
    if (sorted[i].bearing - group[group.length - 1].bearing <= MERGE_DEG) {
      group.push(sorted[i]);
    } else {
      groups.push([sorted[i]]);
    }
  }
  // Gabungkan kelompok pertama dan terakhir bila bertemu di sekitar utara (0°/360°).
  if (groups.length > 1) {
    const first = groups[0];
    const last = groups[groups.length - 1];
    if (first[0].bearing + 360 - last[last.length - 1].bearing <= MERGE_DEG) {
      groups[0] = last.concat(first);
      groups.pop();
    }
  }
  return groups.map((group) => {
    let sx = 0;
    let sy = 0;
    let best = group[0];
    for (const item of group) {
      sx += Math.sin((item.bearing * Math.PI) / 180);
      sy += Math.cos((item.bearing * Math.PI) / 180);
      if (item.rank > best.rank) best = item;
    }
    return {
      bearingDeg: ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360,
      rank: best.rank,
      roadClass: best.roadClass,
      carriageways: group.length,
    };
  });
}

/** Lengan simpang bila pusatnya di `center`. */
function armsAt(center: Pt, lines: Line[]): ArmCluster[] {
  const visited = new Set<number>();
  const queue: number[] = [];
  lines.forEach((line, i) => {
    if (distToLine(center, line) <= NEAR_RADIUS_M) {
      visited.add(i);
      queue.push(i);
    }
  });

  // Ikuti sambungan antar-garis di dalam lingkaran (satu ruas jalan bisa
  // terpotong jadi beberapa garis di data tile).
  while (queue.length > 0) {
    const current = lines[queue.pop() as number];
    const ends = [current.pts[0], current.pts[current.pts.length - 1]].filter(
      (p) => Math.hypot(p.x - center.x, p.y - center.y) < RING_RADIUS_M,
    );
    if (ends.length === 0) continue;
    lines.forEach((other, j) => {
      if (visited.has(j)) return;
      const otherEnds = [other.pts[0], other.pts[other.pts.length - 1]];
      const linked = ends.some((e) =>
        otherEnds.some((o) => Math.hypot(e.x - o.x, e.y - o.y) <= LINK_TOLERANCE_M),
      );
      if (linked) {
        visited.add(j);
        queue.push(j);
      }
    });
  }

  const crossings: { bearing: number; rank: number; roadClass: string }[] = [];
  const bearings: number[] = [];
  for (const i of visited) {
    bearings.length = 0;
    ringCrossings(center, lines[i], RING_RADIUS_M, bearings);
    for (const bearing of bearings) {
      crossings.push({ bearing, rank: lines[i].rank, roadClass: lines[i].roadClass });
    }
  }
  return clusterBearings(crossings);
}

function detect(
  center: { lat: number; lng: number },
  roads: RoadLine[],
  allowed: (roadClass: string) => boolean,
  searchRadius: number,
  minMajorArms: number,
): JunctionResult | null {
  const mPerLat = 110_540;
  const mPerLng = 111_320 * Math.cos((center.lat * Math.PI) / 180);
  const reach = searchRadius + RING_RADIUS_M + 20;

  const lines: Line[] = [];
  for (const road of roads) {
    if (!allowed(road.roadClass) || road.coords.length < 2) continue;
    const pts = road.coords.map(([lng, lat]) => ({
      x: (lng - center.lng) * mPerLng,
      y: (lat - center.lat) * mPerLat,
    }));
    const line: Line = {
      pts,
      rank: CLASS_RANK[road.roadClass] ?? 0,
      roadClass: road.roadClass,
    };
    if (distToLine({ x: 0, y: 0 }, line) <= reach) lines.push(line);
  }
  if (lines.length === 0) return null;

  // Kandidat pusat: titik node, titik-titik garis, dan perpotongan antar-garis
  // di dekatnya (simpul simpang bisa hilang saat garis disederhanakan di tile).
  const candidates: Pt[] = [{ x: 0, y: 0 }];
  const seen = new Set<string>(["0:0"]);
  const addCandidate = (p: Pt) => {
    if (Math.hypot(p.x, p.y) > searchRadius) return;
    const key = `${Math.round(p.x / 5)}:${Math.round(p.y / 5)}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(p);
  };
  for (const line of lines) line.pts.forEach(addCandidate);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i].pts;
      const b = lines[j].pts;
      for (let k = 1; k < a.length; k++) {
        for (let m = 1; m < b.length; m++) {
          const hit = segmentIntersection(a[k - 1], a[k], b[m - 1], b[m]);
          if (hit) addCandidate(hit);
        }
      }
    }
  }

  let best: { arms: ArmCluster[]; center: Pt; score: number } | null = null;
  for (const candidate of candidates) {
    const arms = armsAt(candidate, lines);
    if (arms.length < MIN_ARMS) continue;
    if (arms.filter((arm) => arm.rank > 0).length < minMajorArms) continue;
    const rankSum = arms.reduce((sum, arm) => sum + arm.rank, 0);
    const score =
      Math.min(arms.length, MAX_ARMS) * 100 +
      rankSum * 8 -
      Math.hypot(candidate.x, candidate.y) * DISTANCE_PENALTY_PER_M -
      (arms.length > MAX_ARMS ? 150 : 0);
    if (!best || score > best.score) best = { arms, center: candidate, score };
  }
  if (!best) return null;

  // Simpang dengan lebih dari MAX_ARMS lengan: pertahankan lengan paling utama.
  const kept = best.arms
    .slice()
    .sort((a, b) => b.rank - a.rank || b.carriageways - a.carriageways)
    .slice(0, MAX_ARMS)
    .sort((a, b) => a.bearingDeg - b.bearingDeg);

  return {
    arms: kept.map((arm) => ({
      bearingDeg: (Math.round(arm.bearingDeg * 10) / 10) % 360,
      roadClass: arm.roadClass,
      carriageways: arm.carriageways,
    })),
    center: {
      lat: center.lat + best.center.y / mPerLat,
      lng: center.lng + best.center.x / mPerLng,
    },
    offsetM: Math.round(Math.hypot(best.center.x, best.center.y)),
  };
}

/**
 * Mencari simpang di sekitar `center`. Jalan utama (trunk–tertiary) dicoba
 * dulu; bila tidak membentuk simpang, jalan kecil ikut dihitung asalkan
 * minimal dua lengannya tetap jalan utama (jalan utama dengan jalan samping).
 * Mengembalikan null bila tidak ditemukan simpang dengan minimal 3 lengan.
 */
export function detectJunction(
  center: { lat: number; lng: number },
  roads: RoadLine[],
): JunctionResult | null {
  return (
    detect(center, roads, (c) => MAJOR_CLASSES.has(c), SEARCH_RADIUS_M, MIN_ARMS) ??
    detect(center, roads, (c) => c in CLASS_RANK, MIXED_RADIUS_M, 2)
  );
}
