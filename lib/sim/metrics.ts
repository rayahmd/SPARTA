// Metrik simulasi: antrean, tundaan, dan throughput.

import { QUEUE_SPEED_MPS, backlogSize } from "./engine";
import type { SimState } from "./engine";
import type { SimMetrics } from "./types";

/**
 * Mencuplik panjang antrean (dipanggil engine 1 kali per detik simulasi).
 * Antrean = kendaraan di hulu garis henti dengan v < 5 km/jam + backlog.
 */
export function sampleQueues(state: SimState): void {
  let total = 0;
  for (let a = 0; a < state.lanes.length; a++) {
    let queue = backlogSize(state, a);
    const lanes = state.lanes[a];
    for (let k = 0; k < lanes.length; k++) {
      const arr = lanes[k];
      for (let i = 0; i < arr.length; i++) {
        const veh = arr[i];
        if (!veh.crossed && veh.v < QUEUE_SPEED_MPS) queue++;
      }
    }
    state.queueNowByApproach[a] = queue;
    if (queue > state.queueMaxByApproach[a]) state.queueMaxByApproach[a] = queue;
    total += queue;
  }
  state.queueNow = total;
  state.queueSum += total;
  state.queueSamples++;
  if (total > state.queueMax) state.queueMax = total;
}

/** Ringkasan metrik saat ini sebagai objek baru (aman untuk React state). */
export function readMetrics(state: SimState): SimMetrics {
  const perApproach: SimMetrics["perApproach"] = {};
  const arms = state.layout.arms;
  for (let a = 0; a < arms.length; a++) {
    perApproach[arms[a].id] = {
      queueNow: state.queueNowByApproach[a] ?? 0,
      queueMax: state.queueMaxByApproach[a] ?? 0,
      exited: state.exitedByApproach[a] ?? 0,
    };
  }
  return {
    simTimeSec: state.time,
    queueNow: state.queueNow,
    queueAvg: state.queueSamples > 0 ? state.queueSum / state.queueSamples : 0,
    queueMax: state.queueMax,
    delayAvgSec: state.exited > 0 ? state.delaySumSec / state.exited : 0,
    throughputVph: state.time > 0 ? (state.crossed / state.time) * 3600 : 0,
    spawned: state.spawned,
    exited: state.exited,
    perApproach,
  };
}
