// Tata letak simpang dan lintasan kendaraan. Dipakai engine untuk gerak
// kendaraan dan scene 3D untuk menggambar jalan, jadi keduanya selalu cocok.
//
// Simpang boleh punya 2–5 lengan dengan arah bebas (pertigaan, perempatan,
// simpang miring), sesuai arah jalan sebenarnya.
//
// Koordinat simulasi: x = timur, y = utara, pusat simpang di (0, 0), satuan meter.
// Arah lengan (bearing): 0° = utara, searah jarum jam.
// Lalu lintas lajur kiri: lajur 0 = paling kiri (tepi jalan), lajur n-1 = paling
// kanan (dekat as jalan).

import type { IntersectionSimInput, Movement } from "./types";

export const MOVEMENTS: readonly Movement[] = ["left", "through", "right"];

/** Jarak garis henti dari sudut simpang (ruang penyeberangan). */
export const STOP_SETBACK_M = 4;
/** Kecepatan yang diinginkan saat membelok. */
export const TURN_SPEED_MPS = 5;

const CURVE_SEGMENTS = 24;
const DEG = Math.PI / 180;
/** Selisih arah di atas ini dianggap "berhadapan" (tidak membentuk sudut simpang). */
const OPPOSITE_DEG = 150;
/** Batas jarak sudut simpang untuk lengan yang nyaris sejajar. */
const MAX_CORNER_M = 45;
/** Belokan dengan sudut di bawah ini dianggap gerakan lurus. */
const THROUGH_MAX_DEG = 40;
/** Belokan di atas sudut ini dilewati dengan kecepatan belok. */
const SLOW_TURN_DEG = 30;
// Jarak setelah garis henti di mana kendaraan yang membelok masih dianggap
// menghalangi kendaraan di belakangnya yang punya lintasan berbeda.
const DIVERGE_AFTER_STOP_M: Record<Movement, number> = {
  left: 6,
  through: 0,
  right: 12,
};

export interface ArmExit {
  /** Indeks lengan tujuan. */
  arm: number;
  /** Sudut belok: + = ke kiri, − = ke kanan, 0 = lurus. */
  turnDeg: number;
}

export interface ArmLayout {
  id: string;
  label: string;
  index: number;
  lanes: number;
  bearingDeg: number;
  /** Vektor satuan dari pusat simpang ke arah lengan. */
  ox: number;
  oy: number;
  /** Vektor "kiri" untuk arah masuk (menuju pusat). */
  inLeftX: number;
  inLeftY: number;
  /** Vektor "kiri" untuk arah keluar (menjauhi pusat). */
  outLeftX: number;
  outLeftY: number;
  /** Lebar satu arah = lanes × lebar lajur. */
  halfWidth: number;
  /** Jarak pusat → garis henti. */
  stopDist: number;
  /** Jarak pusat → ujung lengan (titik muncul / hilang kendaraan). */
  endDist: number;
  /** Jarak pusat → sudut simpang di sisi lajur masuk / sisi lajur keluar. */
  cornerIn: number;
  cornerOut: number;
  /** Lengan tujuan untuk tiap gerakan; kosong bila gerakan itu tidak ada. */
  exits: Partial<Record<Movement, ArmExit>>;
}

export interface PathDef {
  approach: number;
  lane: number;
  movement: Movement;
  exitArm: number;
  exitLane: number;
  xs: Float64Array;
  ys: Float64Array;
  /** Jarak kumulatif tiap titik dari awal lintasan. */
  cum: Float64Array;
  length: number;
  /** Posisi garis henti sepanjang lintasan. */
  stopS: number;
  /** Akhir bagian simpang (awal lajur keluar). */
  curveEndS: number;
  /** Setelah titik ini kendaraan tidak lagi menghalangi lintasan lain. */
  divergeS: number;
  isTurn: boolean;
}

export interface IntersectionLayout {
  laneWidth: number;
  approachLength: number;
  arms: ArmLayout[];
  /** paths[pendekat][lajur][gerakan]; null bila gerakan tidak boleh dari lajur itu. */
  paths: (PathDef | null)[][][];
}

export interface Pose {
  x: number;
  y: number;
  heading: number; // radian, atan2(dy, dx)
}

/** Menormalkan sudut ke rentang (−180, 180]. */
export function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Menentukan lengan tujuan untuk gerakan kiri / lurus / kanan dari tiap lengan.
 * Kendaraan dari lengan berarah b melaju ke arah b + 180°; lengan tujuan dengan
 * arah lebih kecil (berlawanan jarum jam) berada di kirinya.
 */
export function computeArmExits(
  bearings: number[],
): Partial<Record<Movement, ArmExit>>[] {
  return bearings.map((bearing, i) => {
    const heading = bearing + 180;
    const candidates: ArmExit[] = [];
    bearings.forEach((other, j) => {
      if (j !== i) candidates.push({ arm: j, turnDeg: normalizeDeg(heading - other) });
    });

    const exits: Partial<Record<Movement, ArmExit>> = {};
    const fit = (movement: Movement, c: ArmExit): number =>
      movement === "through"
        ? Math.abs(c.turnDeg)
        : Math.abs(c.turnDeg - (movement === "left" ? 90 : -90));
    const classOf = (c: ArmExit): Movement =>
      Math.abs(c.turnDeg) <= THROUGH_MAX_DEG
        ? "through"
        : c.turnDeg > 0
          ? "left"
          : "right";

    const leftover: ArmExit[] = [];
    for (const c of candidates) {
      const movement = classOf(c);
      const current = exits[movement];
      if (!current) {
        exits[movement] = c;
      } else if (fit(movement, c) < fit(movement, current)) {
        leftover.push(current);
        exits[movement] = c;
      } else {
        leftover.push(c);
      }
    }
    // Lengan yang kalah bersaing (mis. percabangan Y) mengisi gerakan belok
    // di sisinya bila masih kosong.
    for (const c of leftover) {
      const side: Movement = c.turnDeg >= 0 ? "left" : "right";
      if (!exits[side]) exits[side] = c;
    }
    return exits;
  });
}

/** Gerakan yang boleh dari sebuah lajur. */
export function laneAllows(
  lanes: number,
  lane: number,
  movement: Movement,
  hasThrough = true,
): boolean {
  if (movement === "through") return true;
  if (hasThrough) return movement === "left" ? lane === 0 : lane === lanes - 1;
  // Tanpa gerakan lurus (kaki pertigaan), lajur dibagi dua: kiri dan kanan.
  if (lanes === 1) return true;
  return movement === "left" ? lane < lanes / 2 : lane >= lanes / 2;
}

function laneOffset(lanes: number, lane: number, laneWidth: number): number {
  return (lanes - lane - 0.5) * laneWidth;
}

/**
 * Jarak dari pusat sampai tepi jalan lengan ini bertemu tepi jalan lengan
 * tetangganya (sudut simpang). `sepDeg` = selisih arah kedua lengan.
 */
function cornerDistance(half: number, otherHalf: number, sepDeg: number): number {
  if (sepDeg >= OPPOSITE_DEG) return 0;
  const sin = Math.sin(sepDeg * DEG);
  if (sin < 0.2) return MAX_CORNER_M;
  const d = (otherHalf + half * Math.cos(sepDeg * DEG)) / sin;
  return Math.max(0, Math.min(MAX_CORNER_M, d));
}

function buildPath(
  layout: Omit<IntersectionLayout, "paths">,
  arm: ArmLayout,
  lane: number,
  movement: Movement,
  exit: ArmExit,
): PathDef {
  const { laneWidth } = layout;
  const exitArm = layout.arms[exit.arm];
  const exitLane =
    movement === "right"
      ? Math.max(0, exitArm.lanes - 1 - (arm.lanes - 1 - lane))
      : Math.min(lane, exitArm.lanes - 1);

  const inOff = laneOffset(arm.lanes, lane, laneWidth);
  const outOff = laneOffset(exitArm.lanes, exitLane, laneWidth);

  const spawnX = arm.ox * arm.endDist + arm.inLeftX * inOff;
  const spawnY = arm.oy * arm.endDist + arm.inLeftY * inOff;
  const stopX = arm.ox * arm.stopDist + arm.inLeftX * inOff;
  const stopY = arm.oy * arm.stopDist + arm.inLeftY * inOff;
  const exitX = exitArm.ox * exitArm.stopDist + exitArm.outLeftX * outOff;
  const exitY = exitArm.oy * exitArm.stopDist + exitArm.outLeftY * outOff;
  const endX = exitArm.ox * exitArm.endDist + exitArm.outLeftX * outOff;
  const endY = exitArm.oy * exitArm.endDist + exitArm.outLeftY * outOff;

  // Bezier kubik yang menyinggung arah masuk di garis henti dan arah keluar di
  // awal lajur keluar; berlaku untuk sudut lengan berapa pun.
  const k = 0.4 * Math.hypot(exitX - stopX, exitY - stopY);
  const c1x = stopX - arm.ox * k;
  const c1y = stopY - arm.oy * k;
  const c2x = exitX - exitArm.ox * k;
  const c2y = exitY - exitArm.oy * k;

  const xs: number[] = [spawnX, stopX];
  const ys: number[] = [spawnY, stopY];
  for (let i = 1; i <= CURVE_SEGMENTS; i++) {
    const t = i / CURVE_SEGMENTS;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    xs.push(a * stopX + b * c1x + c * c2x + d * exitX);
    ys.push(a * stopY + b * c1y + c * c2y + d * exitY);
  }
  const curveEndIndex = xs.length - 1;
  xs.push(endX);
  ys.push(endY);

  const cum = new Float64Array(xs.length);
  for (let i = 1; i < xs.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }

  const stopS = cum[1];
  return {
    approach: arm.index,
    lane,
    movement,
    exitArm: exitArm.index,
    exitLane,
    xs: Float64Array.from(xs),
    ys: Float64Array.from(ys),
    cum,
    length: cum[cum.length - 1],
    stopS,
    curveEndS: cum[curveEndIndex],
    divergeS: stopS + DIVERGE_AFTER_STOP_M[movement],
    isTurn: Math.abs(exit.turnDeg) > SLOW_TURN_DEG,
  };
}

export function buildLayout(
  geometry: IntersectionSimInput["geometry"],
): IntersectionLayout {
  const laneWidth = geometry.laneWidthM;
  const approachLength = geometry.approachLengthM;
  const specs = geometry.approaches;
  const count = specs.length;

  const lanes = specs.map((spec) => Math.max(1, Math.round(spec.lanes)));
  const halfWidths = lanes.map((n) => n * laneWidth);
  const exits = computeArmExits(specs.map((spec) => spec.bearingDeg));

  // Tetangga searah jarum jam (sisi lajur masuk) dan berlawanan (sisi lajur keluar).
  const order = specs
    .map((spec, i) => ({ i, bearing: ((spec.bearingDeg % 360) + 360) % 360 }))
    .sort((a, b) => a.bearing - b.bearing || a.i - b.i)
    .map((x) => x.i);
  const rank = new Map(order.map((armIndex, pos) => [armIndex, pos]));
  const separation = (a: number, b: number): number =>
    Math.abs(normalizeDeg(specs[a].bearingDeg - specs[b].bearingDeg));

  const arms: ArmLayout[] = specs.map((spec, index) => {
    const rad = spec.bearingDeg * DEG;
    const ox = Math.sin(rad);
    const oy = Math.cos(rad);
    const pos = rank.get(index) ?? 0;
    const next = order[(pos + 1) % count];
    const prev = order[(pos - 1 + count) % count];
    const half = halfWidths[index];
    const cornerIn =
      count > 1 && next !== index
        ? cornerDistance(half, halfWidths[next], separation(index, next))
        : 0;
    const cornerOut =
      count > 1 && prev !== index
        ? cornerDistance(half, halfWidths[prev], separation(index, prev))
        : 0;
    const stopDist = Math.max(cornerIn, cornerOut, 3) + STOP_SETBACK_M;
    return {
      id: spec.id,
      label: spec.label,
      index,
      lanes: lanes[index],
      bearingDeg: spec.bearingDeg,
      ox,
      oy,
      inLeftX: oy,
      inLeftY: -ox,
      outLeftX: -oy,
      outLeftY: ox,
      halfWidth: half,
      stopDist,
      endDist: stopDist + approachLength,
      cornerIn,
      cornerOut,
      exits: exits[index],
    };
  });

  const base = { laneWidth, approachLength, arms };
  const paths = arms.map((arm) => {
    const hasThrough = !!arm.exits.through;
    return Array.from({ length: arm.lanes }, (_, lane) =>
      MOVEMENTS.map((movement) => {
        const exit = arm.exits[movement];
        return exit && laneAllows(arm.lanes, lane, movement, hasThrough)
          ? buildPath(base, arm, lane, movement, exit)
          : null;
      }),
    );
  });

  return { ...base, paths };
}

/**
 * Posisi dan arah pada jarak `s` sepanjang lintasan. Di luar rentang lintasan
 * hasilnya diekstrapolasi lurus (dipakai untuk badan kendaraan yang baru muncul).
 */
export function poseAt(path: PathDef, s: number, out: Pose): Pose {
  const { xs, ys, cum } = path;
  const last = cum.length - 1;
  let i: number;
  if (s <= 0) {
    i = 0;
  } else if (s >= path.length) {
    i = last - 1;
  } else {
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    i = lo;
  }
  const segLen = cum[i + 1] - cum[i];
  const t = segLen > 0 ? (s - cum[i]) / segLen : 0;
  const dx = xs[i + 1] - xs[i];
  const dy = ys[i + 1] - ys[i];
  out.x = xs[i] + dx * t;
  out.y = ys[i] + dy * t;
  out.heading = Math.atan2(dy, dx);
  return out;
}
