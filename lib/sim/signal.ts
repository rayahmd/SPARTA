// Controller sinyal waktu-tetap: tiap fase berjalan hijau → kuning → all-red,
// lalu pindah ke fase berikutnya dan berulang. Keadaan sinyal adalah fungsi
// murni dari waktu simulasi, jadi diagram fase di UI bisa memakai fungsi yang sama.

import type { ApproachId, PhaseSpec, SignalColor, SignalPlan } from "./types";

export type SignalStage = "green" | "yellow" | "allRed";

export interface SignalState {
  phaseIndex: number;
  stage: SignalStage;
  stageElapsedSec: number;
  stageRemainingSec: number;
  cycleTimeSec: number; // posisi di dalam siklus, 0..cycleSec
}

export function phaseDurationSec(phase: PhaseSpec): number {
  return phase.greenSec + phase.yellowSec + phase.allRedSec;
}

export function sumCycleSec(phases: PhaseSpec[]): number {
  let total = 0;
  for (const phase of phases) total += phaseDurationSec(phase);
  return total;
}

export function createSignalState(): SignalState {
  return {
    phaseIndex: 0,
    stage: "green",
    stageElapsedSec: 0,
    stageRemainingSec: 0,
    cycleTimeSec: 0,
  };
}

/** Mengisi `out` dengan keadaan sinyal pada waktu `tSec` (tanpa alokasi). */
export function signalInto(
  plan: SignalPlan,
  tSec: number,
  out: SignalState,
): SignalState {
  const cycle = plan.cycleSec;
  let t = cycle > 0 ? tSec % cycle : 0;
  if (t < 0) t += cycle;
  out.cycleTimeSec = t;

  const phases = plan.phases;
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    if (t < phase.greenSec) {
      out.phaseIndex = i;
      out.stage = "green";
      out.stageElapsedSec = t;
      out.stageRemainingSec = phase.greenSec - t;
      return out;
    }
    t -= phase.greenSec;
    if (t < phase.yellowSec) {
      out.phaseIndex = i;
      out.stage = "yellow";
      out.stageElapsedSec = t;
      out.stageRemainingSec = phase.yellowSec - t;
      return out;
    }
    t -= phase.yellowSec;
    if (t < phase.allRedSec) {
      out.phaseIndex = i;
      out.stage = "allRed";
      out.stageElapsedSec = t;
      out.stageRemainingSec = phase.allRedSec - t;
      return out;
    }
    t -= phase.allRedSec;
  }

  // Hanya tercapai karena pembulatan di ujung siklus.
  out.phaseIndex = 0;
  out.stage = "green";
  out.stageElapsedSec = 0;
  out.stageRemainingSec = phases.length > 0 ? phases[0].greenSec : 0;
  return out;
}

export function signalAt(plan: SignalPlan, tSec: number): SignalState {
  return signalInto(plan, tSec, createSignalState());
}

/** Warna lampu untuk satu pendekat pada keadaan sinyal tertentu. */
export function colorForApproach(
  plan: SignalPlan,
  state: SignalState,
  approach: ApproachId,
): SignalColor {
  const phase = plan.phases[state.phaseIndex];
  if (!phase || !phase.approaches.includes(approach)) return "red";
  if (state.stage === "green") return "green";
  if (state.stage === "yellow") return "yellow";
  return "red";
}
