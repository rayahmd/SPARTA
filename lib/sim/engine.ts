// Engine simulasi mikroskopik satu persimpangan bersinyal. TypeScript murni:
// tanpa React, DOM, three, Math.random, atau Date.now, supaya deterministik
// dan bisa dites headless.
//
// Simpang boleh punya 2–5 lengan dengan arah bebas (lihat layout.ts); gerakan
// yang tidak ada di sebuah lengan (mis. lurus dari kaki pertigaan) tidak
// pernah dibangkitkan.
//
// Keterbatasan model (sengaja disederhanakan):
// - Fase sinyal per pendekat, jadi konflik antar-arus di dalam simpang tidak
//   dimodelkan. Kendaraan dari pendekat berbeda yang masuk lajur keluar yang
//   sama juga tidak saling berinteraksi.
// - Tiap kendaraan mengikuti satu lintasan 1 dimensi tanpa pindah lajur.
//   Sepeda motor yang menyelip di antara kendaraan tidak dimodelkan.
// - Belok kiri mengikuti sinyal (tidak ada belok kiri langsung).

import { VEHICLE_PARAMS, VEHICLE_TYPES, idmAccel } from "./idm";
import type { VehicleParams } from "./idm";
import { MOVEMENTS, TURN_SPEED_MPS, buildLayout } from "./layout";
import type { IntersectionLayout, PathDef } from "./layout";
import { sampleQueues } from "./metrics";
import { deriveSeed, mulberry32 } from "./rng";
import { colorForApproach, createSignalState, signalInto } from "./signal";
import type { SignalState } from "./signal";
import type {
  IntersectionSimInput,
  Movement,
  PlanId,
  SignalColor,
  SignalPlan,
  VehicleType,
} from "./types";

/** Langkah waktu tetap (detik). */
export const SIM_DT = 0.1;
/** Di bawah kecepatan ini kendaraan dihitung sedang mengantre (5 km/jam). */
export const QUEUE_SPEED_MPS = 5 / 3.6;

const YELLOW_DECEL = 3; // perlambatan nyaman untuk keputusan berhenti saat kuning
const RED_DECEL = 6; // perlambatan maksimum yang masih wajar saat merah
const STOP_LINE_MARGIN_M = 0.5; // kendaraan berhenti sedekat ini dari garis henti
const MIN_GAP_M = 0.2; // pengaman keras: celah tidak boleh lebih kecil dari ini
const SPAWN_CLEARANCE_M = 0.5;

export interface SimVehicle {
  id: number;
  type: VehicleType;
  typeIndex: number;
  params: VehicleParams;
  approach: number;
  lane: number;
  movement: Movement;
  path: PathDef;
  /** Posisi bumper depan sepanjang lintasan (m). */
  s: number;
  v: number;
  arrivalTime: number;
  freeFlowSec: number;
  crossed: boolean;
}

interface PendingArrival {
  type: VehicleType;
  typeIndex: number;
  movement: Movement;
  arrivalTime: number;
}

export interface SimState {
  input: IntersectionSimInput;
  planId: PlanId;
  plan: SignalPlan;
  layout: IntersectionLayout;
  /** Peluang kumulatif gerakan [kiri, lurus, kanan] per pendekat, hanya gerakan yang ada. */
  movementCdf: number[][];
  time: number;
  signal: SignalState;
  /** Warna lampu per pendekat, urutan sama dengan layout.arms. */
  colors: SignalColor[];
  /** lanes[pendekat][lajur] = kendaraan, terdepan di indeks 0. */
  lanes: SimVehicle[][][];
  /** Kendaraan belum melewati garis henti, per lajur (untuk pilihan lajur). */
  uncrossed: number[][];
  /** Kendaraan yang sudah tiba tapi belum bisa masuk karena antrean penuh. */
  backlog: PendingArrival[][];
  backlogHead: number[];
  nextArrival: number[];
  arrivalRate: number[];
  arrivalRng: (() => number)[];
  nextVehicleId: number;
  active: number;
  // Akumulator metrik
  spawned: number;
  exited: number;
  crossed: number;
  delaySumSec: number;
  queueNow: number;
  queueSum: number;
  queueSamples: number;
  queueMax: number;
  lastSampleSec: number;
  queueNowByApproach: number[];
  queueMaxByApproach: number[];
  exitedByApproach: number[];
  crossedByApproach: number[];
}

function planFor(input: IntersectionSimInput, planId: PlanId): SignalPlan {
  const plan = planId === "ai" ? input.plans.ai : input.plans.current;
  if (!plan) throw new Error(`Rencana sinyal "${planId}" tidak tersedia`);
  return plan;
}

function drawInterarrival(rng: () => number, ratePerSec: number): number {
  return -Math.log(1 - rng()) / ratePerSec;
}

function updateColors(state: SimState): void {
  signalInto(state.plan, state.time, state.signal);
  const arms = state.layout.arms;
  for (let a = 0; a < arms.length; a++) {
    state.colors[a] = colorForApproach(state.plan, state.signal, arms[a].id);
  }
}

/** Mengembalikan state ke t = 0 dengan seed yang sama. */
export function resetSim(state: SimState): void {
  const { input, layout } = state;
  state.time = 0;
  state.nextVehicleId = 1;
  state.active = 0;
  state.spawned = 0;
  state.exited = 0;
  state.crossed = 0;
  state.delaySumSec = 0;
  state.queueNow = 0;
  state.queueSum = 0;
  state.queueSamples = 0;
  state.queueMax = 0;
  state.lastSampleSec = 0;

  for (let a = 0; a < layout.arms.length; a++) {
    const arm = layout.arms[a];
    const id = arm.id;
    const spec = input.geometry.approaches.find((x) => x.id === id) ?? null;

    // Peluang gerakan dibatasi ke gerakan yang benar-benar ada di lengan ini.
    const weights = MOVEMENTS.map((m) =>
      arm.exits[m] ? Math.max(0, spec?.turnRatio[m] ?? 0) : 0,
    );
    let total = weights[0] + weights[1] + weights[2];
    if (total <= 0) {
      for (let m = 0; m < MOVEMENTS.length; m++) {
        weights[m] = arm.exits[MOVEMENTS[m]] ? 1 : 0;
      }
      total = weights[0] + weights[1] + weights[2];
    }
    let acc = 0;
    state.movementCdf[a] = weights.map((w) => {
      acc += total > 0 ? w / total : 0;
      return acc;
    });

    // Lengan tanpa tujuan (simpang satu lengan) tidak membangkitkan kendaraan.
    const rate = total > 0 ? Math.max(0, spec?.demandVph ?? 0) / 3600 : 0;
    // Aliran kedatangan hanya bergantung pada seed dan pendekat, tidak pada
    // rencana sinyal, sehingga dua varian menerima kedatangan identik.
    const rng = mulberry32(deriveSeed(input.seed, `arr-${id}`));
    state.arrivalRng[a] = rng;
    state.arrivalRate[a] = rate;
    state.nextArrival[a] = rate > 0 ? drawInterarrival(rng, rate) : Infinity;
    state.backlog[a] = [];
    state.backlogHead[a] = 0;
    state.lanes[a] = [];
    state.uncrossed[a] = [];
    for (let k = 0; k < layout.arms[a].lanes; k++) {
      state.lanes[a].push([]);
      state.uncrossed[a].push(0);
    }
    state.queueNowByApproach[a] = 0;
    state.queueMaxByApproach[a] = 0;
    state.exitedByApproach[a] = 0;
    state.crossedByApproach[a] = 0;
  }
  updateColors(state);
}

export function createSim(input: IntersectionSimInput, planId: PlanId): SimState {
  const state: SimState = {
    input,
    planId,
    plan: planFor(input, planId),
    layout: buildLayout(input.geometry),
    movementCdf: [],
    time: 0,
    signal: createSignalState(),
    colors: [],
    lanes: [],
    uncrossed: [],
    backlog: [],
    backlogHead: [],
    nextArrival: [],
    arrivalRate: [],
    arrivalRng: [],
    nextVehicleId: 1,
    active: 0,
    spawned: 0,
    exited: 0,
    crossed: 0,
    delaySumSec: 0,
    queueNow: 0,
    queueSum: 0,
    queueSamples: 0,
    queueMax: 0,
    lastSampleSec: 0,
    queueNowByApproach: [],
    queueMaxByApproach: [],
    exitedByApproach: [],
    crossedByApproach: [],
  };
  resetSim(state);
  return state;
}

export function backlogSize(state: SimState, approach: number): number {
  return state.backlog[approach].length - state.backlogHead[approach];
}

function pickVehicleType(
  mix: IntersectionSimInput["vehicleMix"],
  u: number,
): number {
  let acc = 0;
  for (let i = 0; i < VEHICLE_TYPES.length; i++) {
    acc += mix[VEHICLE_TYPES[i]];
    if (u < acc) return i;
  }
  return VEHICLE_TYPES.length - 1;
}

function pickMovement(cdf: number[], u: number): Movement {
  let last = 0;
  for (let i = 0; i < MOVEMENTS.length; i++) {
    if (u < cdf[i]) return MOVEMENTS[i];
    if (cdf[i] > (i > 0 ? cdf[i - 1] : 0)) last = i;
  }
  return MOVEMENTS[last]; // hanya tercapai karena pembulatan
}

function generateArrivals(state: SimState): void {
  const { input } = state;
  for (let a = 0; a < state.layout.arms.length; a++) {
    const rate = state.arrivalRate[a];
    if (rate <= 0) continue;
    const rng = state.arrivalRng[a];
    while (state.nextArrival[a] <= state.time) {
      const typeIndex = pickVehicleType(input.vehicleMix, rng());
      const movement = pickMovement(state.movementCdf[a], rng());
      state.backlog[a].push({
        type: VEHICLE_TYPES[typeIndex],
        typeIndex,
        movement,
        arrivalTime: state.nextArrival[a],
      });
      state.spawned++;
      state.nextArrival[a] += drawInterarrival(rng, rate);
    }
  }
}

/** Lajur terpendek di antara lajur yang boleh dipakai gerakan itu; -1 bila tidak ada. */
function chooseLane(state: SimState, approach: number, movement: Movement): number {
  const lanePaths = state.layout.paths[approach];
  const lanes = lanePaths.length;
  const m = MOVEMENTS.indexOf(movement);
  let best = -1;
  let bestCost = Infinity;
  for (let k = 0; k < lanes; k++) {
    if (!lanePaths[k][m]) continue;
    // Lajur tepi juga dipakai kendaraan yang membelok, jadi sedikit dihindari.
    const edge =
      movement === "through" && lanes >= 3 && (k === 0 || k === lanes - 1)
        ? 0.5
        : 0;
    const cost = state.uncrossed[approach][k] + edge;
    if (cost < bestCost) {
      bestCost = cost;
      best = k;
    }
  }
  return best;
}

function freeFlowSec(path: PathDef, p: VehicleParams): number {
  if (!path.isTurn) return path.length / p.v0;
  const curve = path.curveEndS - path.stopS;
  return (path.length - curve) / p.v0 + curve / Math.min(p.v0, TURN_SPEED_MPS);
}

/** Memasukkan paling banyak satu kendaraan per pendekat per langkah. */
function releaseBacklog(state: SimState): void {
  for (let a = 0; a < state.layout.arms.length; a++) {
    const queue = state.backlog[a];
    const head = state.backlogHead[a];
    if (head >= queue.length) continue;

    const pending = queue[head];
    const lane = chooseLane(state, a, pending.movement);
    if (lane < 0) continue;
    const path = state.layout.paths[a][lane][MOVEMENTS.indexOf(pending.movement)];
    if (!path) continue;

    const params = VEHICLE_PARAMS[pending.type];
    const arr = state.lanes[a][lane];
    let v = params.v0;
    if (arr.length > 0) {
      const tail = arr[arr.length - 1];
      const gap = tail.s - tail.params.lengthM;
      if (gap < params.s0 + SPAWN_CLEARANCE_M) continue; // titik masuk tertutup
      const safe = Math.sqrt(
        tail.v * tail.v + 2 * params.b * (gap - params.s0),
      );
      if (safe < v) v = safe;
    }

    arr.push({
      id: state.nextVehicleId++,
      type: pending.type,
      typeIndex: pending.typeIndex,
      params,
      approach: a,
      lane,
      movement: pending.movement,
      path,
      s: 0,
      v,
      arrivalTime: pending.arrivalTime,
      freeFlowSec: freeFlowSec(path, params),
      crossed: false,
    });
    state.uncrossed[a][lane]++;
    state.active++;

    state.backlogHead[a] = head + 1;
    if (state.backlogHead[a] > 64 && state.backlogHead[a] * 2 > queue.length) {
      queue.splice(0, state.backlogHead[a]);
      state.backlogHead[a] = 0;
    }
  }
}

function desiredSpeed(veh: SimVehicle): number {
  const path = veh.path;
  const v0 = veh.params.v0;
  if (!path.isTurn || veh.s >= path.curveEndS) return v0;
  if (veh.s >= path.stopS) return Math.min(v0, TURN_SPEED_MPS);
  // Mendekati tikungan: turunkan kecepatan secara nyaman sebelum garis henti.
  const dist = path.stopS - veh.s;
  const allowed = Math.sqrt(
    TURN_SPEED_MPS * TURN_SPEED_MPS + 2 * veh.params.b * dist,
  );
  return allowed < v0 ? allowed : v0;
}

function moveLane(
  state: SimState,
  approach: number,
  lane: number,
  dt: number,
): void {
  const arr = state.lanes[approach][lane];
  const color = state.colors[approach];
  let write = 0;

  for (let i = 0; i < arr.length; i++) {
    const veh = arr[i];
    const p = veh.params;
    const path = veh.path;
    const v0 = desiredSpeed(veh);

    // Pemimpin: kendaraan terdekat di depan pada lajur masuk yang sama, selama
    // lintasannya sama atau badannya belum memisah dari lintasan kendaraan ini.
    // Kendaraan di depan sudah diperbarui pada langkah ini (urutan depan → belakang).
    let leaderRear = Infinity;
    let leaderV = 0;
    for (let j = write - 1; j >= 0; j--) {
      const cand = arr[j];
      const rear = cand.s - cand.params.lengthM;
      if (
        cand.path === path ||
        rear < Math.max(cand.path.divergeS, path.divergeS)
      ) {
        leaderRear = rear;
        leaderV = cand.v;
        break;
      }
    }

    let acc = idmAccel(
      p,
      veh.v,
      v0,
      leaderRear === Infinity ? Infinity : leaderRear - veh.s,
      veh.v - leaderV,
    );

    if (!veh.crossed && color !== "green") {
      const dist = path.stopS - veh.s;
      const limit = color === "red" ? RED_DECEL : YELLOW_DECEL;
      // Berhenti hanya bila masih bisa berhenti sebelum garis henti.
      if (veh.v * veh.v <= 2 * limit * dist) {
        const stopAcc = idmAccel(
          p,
          veh.v,
          v0,
          dist + p.s0 - STOP_LINE_MARGIN_M,
          veh.v,
        );
        if (stopAcc < acc) acc = stopAcc;
      }
    }

    let vNew = veh.v + acc * dt;
    if (vNew < 0) vNew = 0;
    let sNew = veh.s + 0.5 * (veh.v + vNew) * dt;
    if (leaderRear !== Infinity) {
      const maxS = leaderRear - MIN_GAP_M;
      if (sNew > maxS) {
        sNew = maxS > veh.s ? maxS : veh.s;
        if (vNew > leaderV) vNew = leaderV;
      }
    }
    veh.s = sNew;
    veh.v = vNew;

    if (!veh.crossed && veh.s >= path.stopS) {
      veh.crossed = true;
      state.crossed++;
      state.crossedByApproach[approach]++;
      state.uncrossed[approach][lane]--;
    }

    if (veh.s >= path.length) {
      state.exited++;
      state.exitedByApproach[approach]++;
      state.active--;
      const delay = state.time - veh.arrivalTime - veh.freeFlowSec;
      if (delay > 0) state.delaySumSec += delay;
      continue; // dibuang dari lajur
    }
    arr[write++] = veh;
  }
  arr.length = write;
}

/** Memajukan simulasi satu langkah `dt` detik. Memutasi `state` di tempat. */
export function stepSim(state: SimState, dt: number = SIM_DT): void {
  state.time += dt;
  updateColors(state);
  generateArrivals(state);
  releaseBacklog(state);

  for (let a = 0; a < state.lanes.length; a++) {
    for (let k = 0; k < state.lanes[a].length; k++) {
      moveLane(state, a, k, dt);
    }
  }

  // Metrik antrean dicuplik 1 Hz.
  const sec = Math.floor(state.time + 1e-6);
  if (sec > state.lastSampleSec) {
    state.lastSampleSec = sec;
    sampleQueues(state);
  }
}
