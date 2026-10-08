// Tipe bersama simulasi persimpangan. Dipakai engine (lib/sim), route handler,
// dan panel UI (components/sim). Tidak boleh mengimpor React, DOM, atau three.

/** Id pendekat (lengan simpang). Simpang default memakai "N" | "E" | "S" | "W". */
export type ApproachId = string;
export type Movement = "left" | "through" | "right";
export type VehicleType = "motor" | "mobil" | "bus" | "truk";
export type SignalColor = "green" | "yellow" | "red";
export type PlanId = "current" | "ai";

/** Sama dengan TrafficNode lokal di DigitalTwinMapInner.tsx (kompatibel struktural). */
export interface TrafficNodeSnapshot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  currentLevel: number; // 0..100
  predicted30: number; // 0..100
  confidence: number; // 0..1 dari API, 0..100 di /ephor/prediction
  recommendation: string | null;
}

export type ParsedRecommendation =
  | { kind: "green-delta"; deltaSec: number; raw: string }
  | { kind: "adaptive"; raw: string }
  | { kind: "unparsed"; raw: string }
  | { kind: "none"; raw: null };

/** Lengan simpang hasil pembacaan data jalan (OpenStreetMap) di sekitar node. */
export interface DetectedArm {
  /** Arah lengan dari pusat simpang: 0 = utara, searah jarum jam. */
  bearingDeg: number;
  /** Kelas jalan OpenMapTiles: trunk, primary, secondary, tertiary, minor. */
  roadClass: string;
  /** Jumlah garis jalan yang digabung jadi lengan ini (2 = jalan dua jalur terpisah). */
  carriageways: number;
}

export interface ApproachSpec {
  id: ApproachId;
  label: string;
  /** Arah lengan dari pusat simpang: 0 = utara, searah jarum jam. */
  bearingDeg: number;
  roadClass?: string;
  lanes: number; // lajur masuk
  demandVph: number; // kendaraan/jam
  turnRatio: Record<Movement, number>; // jumlah = 1
}

export interface PhaseSpec {
  id: string;
  label: string;
  approaches: ApproachId[]; // pendekat yang hijau
  greenSec: number;
  yellowSec: number;
  allRedSec: number;
}

export interface SignalPlan {
  id: PlanId;
  label: string;
  phases: PhaseSpec[];
  cycleSec: number; // Σ(green + yellow + allRed)
}

export interface IntersectionSimInput {
  node: TrafficNodeSnapshot; // confidence sudah dinormalkan ke 0..1
  recommendation: ParsedRecommendation;
  geometry: {
    driveSide: "left";
    laneWidthM: number;
    approachLengthM: number;
    approaches: ApproachSpec[];
  };
  vehicleMix: Record<VehicleType, number>; // jumlah = 1
  plans: { current: SignalPlan; ai: SignalPlan | null };
  criticalApproach: ApproachId;
  seed: number;
  meta: {
    source: "db+snapshot" | "snapshot";
    /** Asal bentuk simpang: data jalan OSM di peta, atau perempatan default. */
    junction: { source: "osm" | "default"; armCount: number };
    mocked: string[];
    generatedAt: string;
  };
}

export interface SimMetrics {
  simTimeSec: number;
  queueNow: number; // kendaraan v < 5 km/jam di hulu garis henti + backlog
  queueAvg: number;
  queueMax: number;
  delayAvgSec: number; // tundaan rata-rata per kendaraan yang keluar
  throughputVph: number; // kendaraan melewati garis henti per jam
  spawned: number; // total kedatangan (aktif + keluar + backlog)
  exited: number;
  perApproach: Record<
    ApproachId,
    { queueNow: number; queueMax: number; exited: number }
  >;
}
