// Sensor agent = digital twin simpang yang berjalan terus (engine lib/sim).
// Selama pemantauan rollback, engine kedua menjalankan rencana LAMA dengan
// seed dan kedatangan yang sama (counterfactual), jadi "baseline" adalah apa
// yang akan terjadi seandainya rencana tidak diubah.

import { SIM_DT, createSim, stepSim } from "@/lib/sim/engine";
import type { SimState } from "@/lib/sim/engine";
import type { SignalPlan as SimSignalPlan } from "@/lib/sim/types";
import type { IntersectionModel } from "./model";
import { toSimPlan } from "./plan";
import type { Observation, SignalPlan } from "./types";

export interface Sensor {
  /** Majukan twin `dtSec` detik simulasi. */
  advance(dtSec: number): void;
  /** Pengamatan terkini, atau null bila sensor tidak mengirim data. */
  read(): Observation | null;
  /** Ganti rencana yang berjalan; `counterfactual` = jalankan juga rencana lama. */
  applyPlan(plan: SignalPlan, opts: { counterfactual: boolean }): void;
  /** Antrean total counterfactual, atau null bila tidak ada. */
  counterfactualQueue(): number | null;
  endCounterfactual(): void;
}

function observe(state: SimState): Observation {
  const queueByApproach: Record<string, number> = {};
  state.layout.arms.forEach((arm, i) => {
    queueByApproach[arm.id] = state.queueNowByApproach[i] ?? 0;
  });
  return { queueTotal: state.queueNow, queueByApproach };
}

export class LiveTwinSensor implements Sensor {
  private live: SimState;
  private shadow: SimState | null = null;
  private steps = 0;
  /** Pergantian rencana pada engine live, menurut indeks langkah. */
  private history: { step: number; plan: SimSignalPlan }[] = [];
  /** Injeksi gangguan untuk demo dan test. */
  online = true;

  constructor(private readonly model: IntersectionModel, warmupSec = 0) {
    this.live = createSim(model.input, "current");
    if (warmupSec > 0) this.advance(warmupSec);
  }

  advance(dtSec: number): void {
    const n = Math.round(dtSec / SIM_DT);
    for (let i = 0; i < n; i++) {
      stepSim(this.live, SIM_DT);
      if (this.shadow) stepSim(this.shadow, SIM_DT);
      this.steps++;
    }
  }

  read(): Observation | null {
    return this.online ? observe(this.live) : null;
  }

  applyPlan(plan: SignalPlan, opts: { counterfactual: boolean }): void {
    const next = toSimPlan(plan, "current", "Agent");
    const prev = this.live.plan;
    const sameGreens =
      prev.phases.length === next.phases.length &&
      prev.phases.every((p, i) => p.greenSec === next.phases[i].greenSec);
    if (sameGreens) {
      // Hanya offset yang berubah; engine tidak memodelkan offset.
      this.shadow = null;
      return;
    }
    this.shadow = opts.counterfactual ? this.replay() : null;
    this.live.plan = next;
    this.history.push({ step: this.steps, plan: next });
  }

  /** Engine baru yang mengulang riwayat live sampai sekarang (tanpa pergantian berikutnya). */
  private replay(): SimState {
    const state = createSim(this.model.input, "current");
    let done = 0;
    for (const change of this.history) {
      for (; done < change.step; done++) stepSim(state, SIM_DT);
      state.plan = change.plan;
    }
    for (; done < this.steps; done++) stepSim(state, SIM_DT);
    return state;
  }

  counterfactualQueue(): number | null {
    return this.shadow ? this.shadow.queueNow : null;
  }

  endCounterfactual(): void {
    this.shadow = null;
  }
}
