import { sumCycleSec } from "../signal";
import type {
  ApproachId,
  ApproachSpec,
  IntersectionSimInput,
  PhaseSpec,
  SignalPlan,
  VehicleType,
} from "../types";

const LABELS: Record<ApproachId, string> = {
  N: "Utara",
  E: "Timur",
  S: "Selatan",
  W: "Barat",
};
const ORDER: ApproachId[] = ["N", "E", "S", "W"];
const BEARINGS: Record<ApproachId, number> = { N: 0, E: 90, S: 180, W: 270 };

export function makePlan(
  id: SignalPlan["id"],
  greens: Record<ApproachId, number>,
  arms: ApproachId[] = ORDER,
): SignalPlan {
  const phases: PhaseSpec[] = arms.map((a) => ({
    id: `P-${a}`,
    label: LABELS[a],
    approaches: [a],
    greenSec: greens[a],
    yellowSec: 3,
    allRedSec: 2,
  }));
  return {
    id,
    label: id === "ai" ? "Rekomendasi AI" : "Kondisi Saat Ini",
    phases,
    cycleSec: sumCycleSec(phases),
  };
}

export interface FixtureOptions {
  demand?: Partial<Record<ApproachId, number>>;
  lanes?: Partial<Record<ApproachId, number>>;
  greens?: Record<ApproachId, number>;
  aiGreens?: Record<ApproachId, number> | null;
  mix?: Record<VehicleType, number>;
  throughOnly?: boolean;
  seed?: number;
  /** Lengan yang ada; default perempatan N, E, S, W. */
  arms?: ApproachId[];
  /** Arah lengan bila berbeda dari arah mata angin baku. */
  bearings?: Partial<Record<ApproachId, number>>;
}

export function makeInput(opts: FixtureOptions = {}): IntersectionSimInput {
  const greens = opts.greens ?? { N: 40, E: 25, S: 40, W: 25 };
  const arms = opts.arms ?? ORDER;
  const approaches: ApproachSpec[] = arms.map((id) => ({
    id,
    label: LABELS[id],
    bearingDeg: opts.bearings?.[id] ?? BEARINGS[id],
    lanes: opts.lanes?.[id] ?? (id === "N" || id === "S" ? 3 : 2),
    demandVph: opts.demand?.[id] ?? 600,
    turnRatio: opts.throughOnly
      ? { left: 0, through: 1, right: 0 }
      : { left: 0.2, through: 0.6, right: 0.2 },
  }));
  const aiGreens =
    opts.aiGreens === undefined ? { ...greens, N: greens.N + 15 } : opts.aiGreens;
  return {
    node: {
      id: "fixture",
      name: "Simpang Uji",
      lat: -7.28,
      lng: 112.74,
      currentLevel: 70,
      predicted30: 85,
      confidence: 0.9,
      recommendation: "+15 detik Durasi Hijau",
    },
    recommendation: {
      kind: "green-delta",
      deltaSec: 15,
      raw: "+15 detik Durasi Hijau",
    },
    geometry: {
      driveSide: "left",
      laneWidthM: 3.2,
      approachLengthM: 120,
      approaches,
    },
    vehicleMix: opts.mix ?? { motor: 0.6, mobil: 0.32, bus: 0.03, truk: 0.05 },
    plans: {
      current: makePlan("current", greens, arms),
      ai: aiGreens ? makePlan("ai", aiGreens, arms) : null,
    },
    criticalApproach: "N",
    seed: opts.seed ?? 12345,
    meta: {
      source: "snapshot",
      junction: { source: "default", armCount: arms.length },
      mocked: [],
      generatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}
