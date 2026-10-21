// Input panel simulasi 3D dari model twin agent: tab "Kondisi Saat Ini" =
// siklus default, tab "Rekomendasi AI" = rencana yang diterapkan otomatis oleh
// agent. Memakai model yang sama dengan twin gate, jadi angka di panel sesuai
// dengan dasar keputusan agent.

import { PLAN_LABELS } from "@/lib/sim/adapter";
import type { IntersectionSimInput } from "@/lib/sim/types";
import type { IntersectionAgent } from "./intersection-agent";
import { toSimPlan } from "./plan";

export function agentSimInput(agent: IntersectionAgent, generatedAt: string): IntersectionSimInput {
  const { model, plan } = agent;
  const def = model.defaultPlan;
  const changed =
    plan.offsetSec !== def.offsetSec || plan.phases.some((p, i) => p.greenSec !== def.phases[i]?.greenSec);

  // Pendekat dengan tambahan hijau terbesar (atau pendekat kritis bila hanya offset).
  let critical = model.hotApproachId;
  let bestGain = 0;
  plan.phases.forEach((p, i) => {
    const gain = p.greenSec - (def.phases[i]?.greenSec ?? p.greenSec);
    if (gain > bestGain) {
      bestGain = gain;
      critical = p.approachId;
    }
  });
  const summary = agent.snapshot().activeChange?.summary ?? null;

  return {
    ...model.input,
    node: { ...model.input.node, id: agent.id },
    recommendation:
      changed && summary
        ? bestGain > 0
          ? { kind: "green-delta", deltaSec: bestGain, raw: summary }
          : { kind: "unparsed", raw: summary }
        : { kind: "none", raw: null },
    plans: {
      current: toSimPlan(def, "current", PLAN_LABELS.current),
      ai: changed ? toSimPlan(plan, "ai", PLAN_LABELS.ai) : null,
    },
    criticalApproach: critical,
    meta: {
      ...model.input.meta,
      generatedAt,
      mocked: [...model.input.meta.mocked, "Volume dari prediksi Supervisor (model twin agent)"],
    },
  };
}
