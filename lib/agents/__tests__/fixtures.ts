import { DEFAULT_INTERSECTIONS } from "../intersections";
import type { IntersectionModel } from "../model";
import { AgentRuntime, type RuntimeOptions } from "../runtime";
import type { Sensor } from "../sensor";
import type { AgentEvent, Observation, SignalPlan } from "../types";

export const ID = {
  U: "simpang-tunjungan-gedung-grahadi",
  A: "simpang-pemuda-monkasel",
  B: "simpang-raya-gubeng-stasiun-gubeng",
  K: "simpang-kertajaya-dharmawangsa",
  M: "simpang-merr-kenjeran",
} as const;

/**
 * Sensor berskrip: antrean tetap, bisa dimatikan, diberi NaN, atau dibuat
 * memburuk setelah rencana diganti (counterfactual = antrean sebelum ganti).
 */
export class ScriptedSensor implements Sensor {
  online = true;
  queue = 12;
  nan = false;
  /** Faktor antrean live setelah rencana diganti (counterfactual tetap). */
  worsenFactor = 1;
  applied: SignalPlan[] = [];
  private cf: number | null = null;

  constructor(readonly model: IntersectionModel) {}

  advance(): void {}

  read(): Observation | null {
    if (!this.online) return null;
    const q = this.nan ? Number.NaN : this.queue;
    const queueByApproach: Record<string, number> = {};
    for (const a of this.model.approaches) queueByApproach[a.id] = q / this.model.approaches.length;
    return { queueTotal: q, queueByApproach };
  }

  applyPlan(plan: SignalPlan, opts: { counterfactual: boolean }): void {
    this.applied.push(plan);
    if (opts.counterfactual) {
      this.cf = this.queue;
      this.queue = this.queue * this.worsenFactor;
    }
  }

  counterfactualQueue(): number | null {
    return this.cf;
  }

  endCounterfactual(): void {
    this.cf = null;
  }
}

export function scriptedRuntime(opts: Partial<RuntimeOptions> = {}) {
  const sensors = new Map<string, ScriptedSensor>();
  const runtime = new AgentRuntime({
    intersections: DEFAULT_INTERSECTIONS,
    forecasts: Object.fromEntries(DEFAULT_INTERSECTIONS.map((n) => [n.id, 35])),
    sensorFactory: (model) => {
      const sensor = new ScriptedSensor(model);
      sensors.set(model.info.id, sensor);
      return sensor;
    },
    ...opts,
  });
  return { runtime, sensors };
}

export function liveRuntime(opts: Partial<RuntimeOptions> = {}) {
  return new AgentRuntime({ intersections: DEFAULT_INTERSECTIONS, warmupSec: 0, ...opts });
}

export function eventsOf(runtime: AgentRuntime, type?: AgentEvent["type"]): AgentEvent[] {
  return runtime.eventsSince(0, 10000).filter((e) => !type || e.type === type);
}
