// Car-following Intelligent Driver Model (IDM) dan parameter per jenis kendaraan.
// Semua nilai parameter adalah asumsi demo, bukan hasil kalibrasi lapangan.

import type { VehicleType } from "./types";

export interface VehicleParams {
  lengthM: number;
  widthM: number;
  heightM: number;
  v0: number; // kecepatan yang diinginkan (m/dtk)
  aMax: number; // percepatan maksimum (m/dtk²)
  b: number; // perlambatan nyaman (m/dtk²)
  T: number; // jarak waktu aman (dtk)
  s0: number; // celah minimum saat berhenti (m)
}

export const VEHICLE_TYPES: readonly VehicleType[] = [
  "motor",
  "mobil",
  "bus",
  "truk",
];

const KMH = 1 / 3.6;

export const VEHICLE_PARAMS: Record<VehicleType, VehicleParams> = {
  motor: {
    lengthM: 2.0,
    widthM: 0.8,
    heightM: 1.3,
    v0: 40 * KMH,
    aMax: 2.0,
    b: 2.5,
    T: 0.9,
    s0: 1.0,
  },
  mobil: {
    lengthM: 4.5,
    widthM: 1.8,
    heightM: 1.5,
    v0: 40 * KMH,
    aMax: 1.6,
    b: 2.0,
    T: 1.0,
    s0: 2.0,
  },
  bus: {
    lengthM: 12.0,
    widthM: 2.5,
    heightM: 3.2,
    v0: 35 * KMH,
    aMax: 1.0,
    b: 2.0,
    T: 1.4,
    s0: 2.5,
  },
  truk: {
    lengthM: 9.0,
    widthM: 2.4,
    heightM: 3.0,
    v0: 35 * KMH,
    aMax: 0.9,
    b: 2.0,
    T: 1.5,
    s0: 2.5,
  },
};

/** Batas perlambatan darurat supaya IDM tidak menghasilkan nilai ekstrem. */
export const MAX_DECEL = 8;

/**
 * Percepatan IDM.
 * @param v kecepatan kendaraan (m/dtk)
 * @param v0 kecepatan yang diinginkan saat ini (m/dtk)
 * @param gap celah bumper-ke-bumper ke pemimpin (m); Infinity bila tidak ada
 * @param dv kecepatan mendekat = v − v pemimpin (m/dtk)
 */
export function idmAccel(
  p: VehicleParams,
  v: number,
  v0: number,
  gap: number,
  dv: number,
): number {
  const ratio = v / v0;
  const free = 1 - ratio * ratio * ratio * ratio;
  let acc: number;
  if (gap === Infinity) {
    acc = p.aMax * free;
  } else {
    const sStar =
      p.s0 + Math.max(0, v * p.T + (v * dv) / (2 * Math.sqrt(p.aMax * p.b)));
    const g = gap > 0.01 ? gap : 0.01;
    const interaction = sStar / g;
    acc = p.aMax * (free - interaction * interaction);
  }
  if (acc < -MAX_DECEL) return -MAX_DECEL;
  if (acc > p.aMax) return p.aMax;
  return acc;
}
