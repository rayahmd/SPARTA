// Batas keselamatan sebagai aturan KERAS di luar kendali agent. Planner,
// balasan tetangga, rollback, fail-safe, dan override operator semuanya lewat
// sini. Rencana yang melanggar ditolak apa adanya; guardrail tidak pernah
// "memperbaiki" rencana diam-diam.

import type { AgentConfig } from "./config";
import { cycleOf, greenFloor, offsetDelta } from "./plan";
import type { SignalPlan } from "./types";

export type GuardrailResult = { ok: true } | { ok: false; violations: string[] };

export function checkPlan(
  plan: SignalPlan,
  previous: SignalPlan | null,
  cfg: AgentConfig,
): GuardrailResult {
  const v: string[] = [];
  const numbers = [plan.offsetSec, plan.cycleSec, ...plan.phases.flatMap((p) => [p.greenSec, p.yellowSec, p.allRedSec])];
  if (plan.phases.length === 0 || numbers.some((n) => !Number.isFinite(n))) {
    return { ok: false, violations: ["Rencana kosong atau berisi angka tidak valid"] };
  }

  const floor = greenFloor(cfg);
  for (const p of plan.phases) {
    if (p.greenSec < cfg.minGreenSec) v.push(`Hijau ${p.label} ${p.greenSec} dtk < minimum ${cfg.minGreenSec} dtk`);
    if (p.greenSec > cfg.maxGreenSec) v.push(`Hijau ${p.label} ${p.greenSec} dtk > maksimum ${cfg.maxGreenSec} dtk`);
    if (p.greenSec < floor && p.greenSec >= cfg.minGreenSec) {
      v.push(`Hijau ${p.label} ${p.greenSec} dtk < waktu aman pejalan kaki ${cfg.pedestrianClearanceSec} dtk`);
    }
    if (p.yellowSec !== cfg.yellowSec) v.push(`Kuning ${p.label} harus tetap ${cfg.yellowSec} dtk`);
    if (p.allRedSec !== cfg.allRedSec) v.push(`All-red ${p.label} harus tetap ${cfg.allRedSec} dtk`);
  }

  const cycle = cycleOf(plan.phases);
  if (cycle !== plan.cycleSec) v.push(`Panjang siklus tercatat ${plan.cycleSec} dtk, jumlah fase ${cycle} dtk`);
  if (cycle < cfg.cycleMinSec || cycle > cfg.cycleMaxSec) {
    v.push(`Siklus ${cycle} dtk di luar rentang ${cfg.cycleMinSec}–${cfg.cycleMaxSec} dtk`);
  }
  if (plan.offsetSec < 0 || plan.offsetSec >= Math.max(1, cycle)) v.push(`Offset ${plan.offsetSec} dtk di luar siklus`);

  if (previous) {
    const sameOrder =
      previous.phases.length === plan.phases.length &&
      previous.phases.every((p, i) => p.approachId === plan.phases[i].approachId);
    if (!sameOrder) {
      v.push("Urutan atau jumlah fase berubah");
    } else {
      plan.phases.forEach((p, i) => {
        const d = Math.abs(p.greenSec - previous.phases[i].greenSec);
        if (d > cfg.maxDeltaPerCycleSec) {
          v.push(`Hijau ${p.label} berubah ${d} dtk > batas ${cfg.maxDeltaPerCycleSec} dtk per siklus`);
        }
      });
      const dOffset = Math.abs(offsetDelta(previous.offsetSec, plan.offsetSec, cycle));
      if (dOffset > cfg.maxDeltaPerCycleSec) {
        v.push(`Offset berubah ${dOffset} dtk > batas ${cfg.maxDeltaPerCycleSec} dtk per siklus`);
      }
    }
  }

  return v.length === 0 ? { ok: true } : { ok: false, violations: v };
}

export function guardOk(result: GuardrailResult): result is { ok: true } {
  return result.ok;
}

export function describeViolations(result: GuardrailResult): string {
  return result.ok ? "" : result.violations.join("; ");
}
