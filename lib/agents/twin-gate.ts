// Twin gate: setiap rencana diuji dulu di digital twin (engine lib/sim) dan
// hanya diterapkan bila skor dampaknya membaik minimal `twinMinImprovementPct`
// dibanding rencana yang sedang berjalan.
//
// Skor (lebih kecil lebih baik, satuan kendaraan) =
//   antrean rata-rata hasil engine lib/sim selama `twinHorizonSec`
//   + biaya jaringan analitik yang tidak dimodelkan engine satu simpang:
//     - rombongan dari tetangga hulu yang tiba saat merah (ukuran × tunggu ÷ siklus)
//     - antrean balik ke simpang hilir yang sudah jenuh (pelepasan × kelebihan tekanan)
// Engine tidak memodelkan offset, jadi rencana yang hanya menggeser offset
// dinilai dari biaya rombongan saja.

import { createSim, stepSim, SIM_DT } from "@/lib/sim/engine";
import { readMetrics } from "@/lib/sim/metrics";
import type { AgentConfig } from "./config";
import { approachById, dischargePerGreen, type IntersectionModel } from "./model";
import { toSimPlan, waitForGreen } from "./plan";
import type { SignalPlan, TwinScore } from "./types";

export type NetworkTerm =
  | {
      kind: "platoon";
      /** Pendekat penerima rombongan di simpang ini. */
      approachId: string;
      sizeVeh: number;
      arrivalAtSec: number;
    }
  | {
      kind: "spillback";
      /** Pendekat simpang ini yang melepas arus ke simpang hilir yang jenuh. */
      approachId: string;
      downstreamPressure: number;
    };

export interface TwinVerdict extends TwinScore {
  passed: boolean;
}

export function networkCost(
  model: IntersectionModel,
  plan: SignalPlan,
  terms: NetworkTerm[],
  cfg: Pick<AgentConfig, "spillbackPressure" | "spillbackWeight">,
): number {
  let cost = 0;
  for (const term of terms) {
    if (term.kind === "platoon") {
      const wait = waitForGreen(plan, term.approachId, term.arrivalAtSec);
      cost += (term.sizeVeh * wait) / plan.cycleSec;
    } else {
      const a = approachById(model, term.approachId);
      const phase = plan.phases.find((p) => p.approachId === term.approachId);
      if (!a || !phase) continue;
      const excess = Math.max(0, term.downstreamPressure - cfg.spillbackPressure);
      cost += cfg.spillbackWeight * excess * dischargePerGreen(a, phase.greenSec) * a.through;
    }
  }
  return cost;
}

export interface TwinGate {
  evaluate(model: IntersectionModel, current: SignalPlan, candidate: SignalPlan, terms: NetworkTerm[]): TwinVerdict;
}

/** Twin gate bawaan: engine lib/sim + biaya jaringan, dengan cache hasil engine. */
export class SimTwinGate implements TwinGate {
  private cache = new Map<string, number>();

  constructor(private readonly cfg: AgentConfig) {}

  /** Antrean rata-rata engine untuk rencana `plan` (offset diabaikan engine). */
  localScore(model: IntersectionModel, plan: SignalPlan): number {
    const key = `${model.simKey}|${model.input.seed}|${model.approaches.map((a) => a.demandVph).join(",")}|${plan.phases
      .map((p) => p.greenSec)
      .join(",")}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const input = { ...model.input, plans: { current: toSimPlan(plan, "current", "Twin"), ai: null } };
    const sim = createSim(input, "current");
    const steps = Math.round(this.cfg.twinHorizonSec / SIM_DT);
    for (let i = 0; i < steps; i++) stepSim(sim, SIM_DT);
    const score = readMetrics(sim).queueAvg;
    if (this.cache.size > 2000) this.cache.clear();
    this.cache.set(key, score);
    return score;
  }

  evaluate(model: IntersectionModel, current: SignalPlan, candidate: SignalPlan, terms: NetworkTerm[]): TwinVerdict {
    const currentScore = this.localScore(model, current) + networkCost(model, current, terms, this.cfg);
    const candidateScore = this.localScore(model, candidate) + networkCost(model, candidate, terms, this.cfg);
    const improvementPct = currentScore > 0 ? ((currentScore - candidateScore) / currentScore) * 100 : 0;
    return {
      currentScore: round2(currentScore),
      candidateScore: round2(candidateScore),
      improvementPct: round2(improvementPct),
      passed: improvementPct >= this.cfg.twinMinImprovementPct,
    };
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
