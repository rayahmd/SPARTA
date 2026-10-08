// Adapter: snapshot node lalu lintas → input simulasi persimpangan.
//
// Dari data yang benar-benar ada dipakai: teks rekomendasi AI (di-parse jadi
// selisih detik), currentLevel (jadi volume kedatangan), confidence, id (jadi
// seed), dan — bila tersedia — bentuk simpang hasil pembacaan data jalan
// OpenStreetMap di peta (jumlah lengan, arah, kelas jalan).
// Durasi fase eksisting, jumlah lajur, rasio belok, dan komposisi kendaraan
// TIDAK ada di repo, jadi dibuat sebagai data demo yang deterministik dari seed
// dan dicatat di `meta.mocked`.

import { computeArmExits, MOVEMENTS, normalizeDeg } from "./layout";
import { parseRecommendation } from "./recommendation";
import { fnv1a, mulberry32 } from "./rng";
import { sumCycleSec } from "./signal";
import type {
  ApproachSpec,
  DetectedArm,
  IntersectionSimInput,
  Movement,
  ParsedRecommendation,
  PhaseSpec,
  SignalPlan,
  TrafficNodeSnapshot,
} from "./types";

/** Arus jenuh asumsi per lajur (kendaraan/jam). */
export const SAT_FLOW_VPH_PER_LANE = 1800;
export const MIN_GREEN_SEC = 10;
export const MAX_GREEN_SEC = 90;
export const YELLOW_SEC = 3;
export const ALL_RED_SEC = 2;
export const LANE_WIDTH_M = 3.2;
export const APPROACH_LENGTH_M = 120;
export const MIN_ARMS = 2;
export const MAX_ARMS = 5;

export const PLAN_LABELS = {
  current: "Kondisi Saat Ini",
  ai: "Rekomendasi AI",
} as const;

const COMPASS = [
  "Utara",
  "Timur Laut",
  "Timur",
  "Tenggara",
  "Selatan",
  "Barat Daya",
  "Barat",
  "Barat Laut",
];

/** Nama arah mata angin untuk sebuah bearing (0 = utara, searah jarum jam). */
export function compassLabel(bearingDeg: number): string {
  const normalized = ((bearingDeg % 360) + 360) % 360;
  return COMPASS[Math.round(normalized / 45) % 8];
}

/** Peringkat kelas jalan OpenMapTiles; makin besar makin utama. */
const ROAD_RANK: Record<string, number> = {
  trunk: 4,
  primary: 3,
  secondary: 2,
  tertiary: 1,
};
/** Jumlah lajur per arah yang diasumsikan untuk tiap kelas jalan. */
const LANES_BY_CLASS: Record<string, number> = {
  trunk: 3,
  primary: 3,
  secondary: 2,
  tertiary: 2,
  minor: 1,
};

interface ArmSeed {
  id: string;
  label: string;
  bearingDeg: number;
  roadClass?: string;
  /** Diisi untuk simpang hasil deteksi; simpang default memakai sumbu mayor acak. */
  rank?: number;
}

const DEFAULT_ARMS: ArmSeed[] = [
  { id: "N", label: "Utara", bearingDeg: 0 },
  { id: "E", label: "Timur", bearingDeg: 90 },
  { id: "S", label: "Selatan", bearingDeg: 180 },
  { id: "W", label: "Barat", bearingDeg: 270 },
];

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Lengan hasil deteksi → daftar lengan berurutan searah jarum jam, atau null bila tidak layak. */
function armsFromDetection(arms: DetectedArm[] | null | undefined): ArmSeed[] | null {
  if (!arms) return null;
  const valid = arms
    .filter((arm) => Number.isFinite(arm.bearingDeg))
    .map((arm) => ({
      bearingDeg: ((arm.bearingDeg % 360) + 360) % 360,
      roadClass: arm.roadClass,
    }))
    .sort((a, b) => a.bearingDeg - b.bearingDeg);
  if (valid.length < MIN_ARMS || valid.length > MAX_ARMS) return null;

  const used = new Map<string, number>();
  return valid.map((arm, i) => {
    const base = compassLabel(arm.bearingDeg);
    const seen = (used.get(base) ?? 0) + 1;
    used.set(base, seen);
    return {
      id: `A${i + 1}`,
      label: seen > 1 ? `${base} ${seen}` : base,
      bearingDeg: arm.bearingDeg,
      roadClass: arm.roadClass,
      rank: ROAD_RANK[arm.roadClass] ?? 0,
    };
  });
}

/**
 * Lengan "mayor" simpang hasil deteksi: kelas jalan tertinggi. Bila semua
 * lengan sekelas, dua lengan yang paling berhadapan dianggap jalan utamanya.
 */
function majorArms(arms: ArmSeed[]): boolean[] {
  const top = Math.max(...arms.map((arm) => arm.rank ?? 0));
  const major = arms.map((arm) => (arm.rank ?? 0) === top);
  if (arms.length >= 3 && major.every(Boolean)) {
    let best: [number, number] = [0, 1];
    let bestSep = -1;
    for (let i = 0; i < arms.length; i++) {
      for (let j = i + 1; j < arms.length; j++) {
        const sep = Math.abs(normalizeDeg(arms[i].bearingDeg - arms[j].bearingDeg));
        if (sep > bestSep) {
          bestSep = sep;
          best = [i, j];
        }
      }
    }
    return arms.map((_, i) => i === best[0] || i === best[1]);
  }
  return major;
}

function makePlan(
  id: SignalPlan["id"],
  arms: ArmSeed[],
  greens: number[],
): SignalPlan {
  const phases: PhaseSpec[] = arms.map((arm, i) => ({
    id: `P-${arm.id}`,
    label: arm.label,
    approaches: [arm.id],
    greenSec: greens[i],
    yellowSec: YELLOW_SEC,
    allRedSec: ALL_RED_SEC,
  }));
  return { id, label: PLAN_LABELS[id], phases, cycleSec: sumCycleSec(phases) };
}

/**
 * Membagi ulang total hijau sebanding `weights`, minimum MIN_GREEN_SEC per fase,
 * dengan jumlah total tetap (panjang siklus tidak berubah).
 */
function redistributeGreens(greens: number[], weights: number[]): number[] {
  const total = greens.reduce((sum, g) => sum + g, 0);
  const sumW = weights.reduce((sum, w) => sum + w, 0);
  if (sumW <= 0) return greens.slice();

  const result = weights.map((w) =>
    clamp(Math.round((total * w) / sumW), MIN_GREEN_SEC, MAX_GREEN_SEC),
  );
  const byWeight = weights
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .map((x) => x.i);

  let diff = total - result.reduce((sum, g) => sum + g, 0);
  for (let guard = 0; diff !== 0 && guard < 1000; guard++) {
    if (diff > 0) {
      const i = byWeight.find((idx) => result[idx] < MAX_GREEN_SEC);
      if (i === undefined) break;
      result[i]++;
      diff--;
    } else {
      // Kurangi dari fase berbobot terendah yang masih di atas minimum.
      let target = -1;
      for (let k = byWeight.length - 1; k >= 0; k--) {
        if (result[byWeight[k]] > MIN_GREEN_SEC) {
          target = byWeight[k];
          break;
        }
      }
      if (target < 0) break;
      result[target]--;
      diff++;
    }
  }
  return result;
}

function buildAiPlan(
  recommendation: ParsedRecommendation,
  arms: ArmSeed[],
  currentGreens: number[],
  approaches: ApproachSpec[],
  criticalIndex: number,
): SignalPlan | null {
  if (recommendation.kind === "green-delta") {
    const greens = currentGreens.slice();
    greens[criticalIndex] = clamp(
      greens[criticalIndex] + recommendation.deltaSec,
      MIN_GREEN_SEC,
      MAX_GREEN_SEC,
    );
    return makePlan("ai", arms, greens);
  }
  if (recommendation.kind === "adaptive") {
    const weights = approaches.map(
      (a) => a.demandVph / (SAT_FLOW_VPH_PER_LANE * a.lanes),
    );
    return makePlan("ai", arms, redistributeGreens(currentGreens, weights));
  }
  return null;
}

/** Rasio belok hanya untuk gerakan yang ada di lengan itu; jumlahnya 1. */
function turnRatioFor(
  available: Partial<Record<Movement, unknown>>,
  left: number,
  right: number,
): Record<Movement, number> {
  const raw: Record<Movement, number> = {
    left: available.left ? left : 0,
    through: available.through ? 1 - left - right : 0,
    right: available.right ? right : 0,
  };
  const total = raw.left + raw.through + raw.right;
  if (total <= 0) return { left: 0, through: 0, right: 0 };
  const ratio: Record<Movement, number> = { left: 0, through: 0, right: 0 };
  let assigned = 0;
  let last: Movement | null = null;
  for (const movement of MOVEMENTS) {
    if (raw[movement] <= 0) continue;
    ratio[movement] = round2(raw[movement] / total);
    assigned += ratio[movement];
    last = movement;
  }
  // Sisa pembulatan masuk ke gerakan terakhir supaya jumlahnya tepat 1.
  if (last) ratio[last] = round2(ratio[last] + 1 - assigned);
  return ratio;
}

export interface BuildSimInputOptions {
  source: IntersectionSimInput["meta"]["source"];
  generatedAt: string;
  /** Lengan simpang dari data jalan; kosong → perempatan default. */
  arms?: DetectedArm[] | null;
}

export function buildSimInput(
  snapshot: TrafficNodeSnapshot,
  opts: BuildSimInputOptions,
): IntersectionSimInput {
  const seed = fnv1a(snapshot.id);
  const rng = mulberry32(seed);

  const currentLevel = clamp(snapshot.currentLevel, 0, 100);
  const predicted30 = clamp(snapshot.predicted30, 0, 100);
  const confidence = clamp(
    snapshot.confidence > 1 ? snapshot.confidence / 100 : snapshot.confidence,
    0,
    1,
  );
  const recommendation = parseRecommendation(snapshot.recommendation);

  const detected = armsFromDetection(opts.arms);
  const arms = detected ?? DEFAULT_ARMS;
  const exits = computeArmExits(arms.map((arm) => arm.bearingDeg));

  // ── Data demo (urutan pemanggilan rng tetap supaya deterministik) ──
  const majorNS = rng() < 0.5;
  const greenMajor = 35 + Math.floor(rng() * 11); // 35..45
  const greenMinor = 22 + Math.floor(rng() * 9); // 22..30
  const isMajor = detected
    ? majorArms(detected)
    : arms.map((arm) => (arm.id === "N" || arm.id === "S") === majorNS);

  const currentGreens = arms.map((_, i) =>
    isMajor[i] ? greenMajor : greenMinor,
  );
  const current = makePlan("current", arms, currentGreens);

  // Derajat kejenuhan dari tingkat kemacetan saat ini.
  const saturation = clamp(0.3 + (0.75 * currentLevel) / 100, 0.3, 1.05);

  let criticalIndex = 0;
  let criticalRatio = -Infinity;
  const approaches: ApproachSpec[] = arms.map((arm, i) => {
    const lanes = detected
      ? (LANES_BY_CLASS[arm.roadClass ?? ""] ?? 2)
      : isMajor[i]
        ? 3
        : 2;
    const weight = 0.85 + rng() * 0.3;
    const capacity =
      (SAT_FLOW_VPH_PER_LANE * lanes * currentGreens[i]) / current.cycleSec;
    const demandVph = Math.round(saturation * capacity * weight);
    const ratio = demandVph / capacity;
    if (ratio > criticalRatio) {
      criticalRatio = ratio;
      criticalIndex = i;
    }
    const left = round2(0.2 + (rng() - 0.5) * 0.1);
    const right = round2(0.2 + (rng() - 0.5) * 0.1);
    return {
      id: arm.id,
      label: arm.label,
      bearingDeg: arm.bearingDeg,
      roadClass: arm.roadClass,
      lanes,
      demandVph,
      turnRatio: turnRatioFor(exits[i], left, right),
    };
  });

  const mocked = [
    "Durasi fase eksisting",
    detected ? "Jumlah lajur" : "Bentuk dan geometri simpang",
    "Volume kendaraan",
    "Rasio belok",
    "Komposisi kendaraan",
    "Arus jenuh",
    "Pendekat penerima perubahan hijau",
  ];

  return {
    node: {
      id: snapshot.id,
      name: snapshot.name,
      lat: snapshot.lat,
      lng: snapshot.lng,
      currentLevel,
      predicted30,
      confidence,
      recommendation: recommendation.raw,
    },
    recommendation,
    geometry: {
      driveSide: "left",
      laneWidthM: LANE_WIDTH_M,
      approachLengthM: APPROACH_LENGTH_M,
      approaches,
    },
    vehicleMix: { motor: 0.6, mobil: 0.32, bus: 0.03, truk: 0.05 },
    plans: {
      current,
      ai: buildAiPlan(recommendation, arms, currentGreens, approaches, criticalIndex),
    },
    criticalApproach: arms[criticalIndex].id,
    seed,
    meta: {
      source: opts.source,
      junction: {
        source: detected ? "osm" : "default",
        armCount: arms.length,
      },
      mocked,
      generatedAt: opts.generatedAt,
    },
  };
}
