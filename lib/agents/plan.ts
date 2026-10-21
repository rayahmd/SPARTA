// Operasi murni pada SignalPlan agent: konversi dari/ke rencana lib/sim,
// pergeseran hijau dengan panjang siklus tetap, offset, dan jendela hijau
// pada jam bersama.

import { sumCycleSec } from "@/lib/sim/signal";
import type { IntersectionSimInput, PlanId, SignalPlan as SimSignalPlan } from "@/lib/sim/types";
import type { AgentConfig } from "./config";
import type { AgentPhase, PlanSource, SignalPlan } from "./types";

export function mod(value: number, m: number): number {
  return m > 0 ? ((value % m) + m) % m : 0;
}

export function cycleOf(phases: AgentPhase[]): number {
  return phases.reduce((sum, p) => sum + p.greenSec + p.yellowSec + p.allRedSec, 0);
}

export function withPhases(plan: SignalPlan, phases: AgentPhase[], source: PlanSource): SignalPlan {
  const cycleSec = cycleOf(phases);
  return { phases, offsetSec: mod(plan.offsetSec, cycleSec), cycleSec, source };
}

/** Rencana default agent = rencana eksisting di input simulasi. */
export function planFromSimInput(input: IntersectionSimInput): SignalPlan {
  const bearing = new Map(input.geometry.approaches.map((a) => [a.id, a.bearingDeg]));
  const phases: AgentPhase[] = input.plans.current.phases.map((p) => ({
    id: p.id,
    approachId: p.approaches[0],
    label: p.label,
    bearingDeg: bearing.get(p.approaches[0]) ?? 0,
    greenSec: p.greenSec,
    yellowSec: p.yellowSec,
    allRedSec: p.allRedSec,
  }));
  return { phases, offsetSec: 0, cycleSec: cycleOf(phases), source: "default" };
}

/** Rencana agent → rencana lib/sim (offset tidak dimodelkan engine). */
export function toSimPlan(plan: SignalPlan, id: PlanId, label: string): SimSignalPlan {
  const phases = plan.phases.map((p) => ({
    id: p.id,
    label: p.label,
    approaches: [p.approachId],
    greenSec: p.greenSec,
    yellowSec: p.yellowSec,
    allRedSec: p.allRedSec,
  }));
  return { id, label, phases, cycleSec: sumCycleSec(phases) };
}

export function phaseIndex(plan: SignalPlan, approachId: string): number {
  return plan.phases.findIndex((p) => p.approachId === approachId);
}

export function greenFloor(cfg: Pick<AgentConfig, "minGreenSec" | "pedestrianClearanceSec">): number {
  return Math.max(cfg.minGreenSec, cfg.pedestrianClearanceSec);
}

/**
 * Memindahkan `delta` detik hijau ke pendekat `approachId` (negatif = mengambil),
 * diimbangi fase lain sebanding sisa hijaunya di atas batas bawah, sehingga
 * panjang siklus tetap. Bila sisa tidak cukup, perpindahan dipotong; nilai yang
 * benar-benar dipindahkan dikembalikan di `applied`.
 */
export function shiftGreen(
  plan: SignalPlan,
  approachId: string,
  delta: number,
  cfg: Pick<AgentConfig, "minGreenSec" | "maxGreenSec" | "pedestrianClearanceSec">,
  source: PlanSource,
): { plan: SignalPlan; applied: number } {
  const target = phaseIndex(plan, approachId);
  if (target < 0 || delta === 0) return { plan, applied: 0 };
  const floor = greenFloor(cfg);
  const greens = plan.phases.map((p) => p.greenSec);
  const others = greens.map((_, i) => i).filter((i) => i !== target);

  let want: number;
  if (delta > 0) {
    const slack = others.reduce((s, i) => s + Math.max(0, greens[i] - floor), 0);
    want = Math.min(delta, cfg.maxGreenSec - greens[target], slack);
  } else {
    const room = others.reduce((s, i) => s + Math.max(0, cfg.maxGreenSec - greens[i]), 0);
    want = -Math.min(-delta, greens[target] - floor, room);
  }
  if (want === 0 || Math.sign(want) !== Math.sign(delta)) return { plan, applied: 0 };

  const result = greens.slice();
  result[target] += want;
  // Bagikan -want ke fase lain sebanding ruang geraknya (sisa di atas batas
  // bawah, atau ruang di bawah maksimum), sisa pembulatan ke ruang terbesar.
  const room = others.map((i) => (want > 0 ? Math.max(0, greens[i] - floor) : Math.max(0, cfg.maxGreenSec - greens[i])));
  const totalRoom = room.reduce((s, r) => s + r, 0);
  const amount = Math.abs(want);
  const shares = room.map((r) => Math.floor((amount * r) / totalRoom));
  let remaining = amount - shares.reduce((s, x) => s + x, 0);
  const order = others
    .map((_, k) => k)
    .sort((a, b) => (amount * room[b]) / totalRoom - shares[b] - ((amount * room[a]) / totalRoom - shares[a]) || a - b);
  for (const k of order) {
    if (remaining <= 0) break;
    if (shares[k] < room[k]) {
      shares[k]++;
      remaining--;
    }
  }
  others.forEach((i, k) => {
    result[i] += want > 0 ? -shares[k] : shares[k];
  });
  const phases = plan.phases.map((p, i) => ({ ...p, greenSec: result[i] }));
  return { plan: withPhases(plan, phases, source), applied: want };
}

export function withOffset(plan: SignalPlan, offsetSec: number, source: PlanSource): SignalPlan {
  return { ...plan, offsetSec: mod(Math.round(offsetSec), plan.cycleSec), source };
}

/** Selisih offset terpendek (bertanda) dari `a` ke `b` dalam siklus `cycle`. */
export function offsetDelta(a: number, b: number, cycle: number): number {
  const d = mod(b - a, cycle);
  return d > cycle / 2 ? d - cycle : d;
}

/** Jendela hijau pendekat dalam siklus lokal: [start, end). */
export function greenWindow(plan: SignalPlan, approachId: string): { start: number; end: number } | null {
  let t = 0;
  for (const p of plan.phases) {
    if (p.approachId === approachId) return { start: t, end: t + p.greenSec };
    t += p.greenSec + p.yellowSec + p.allRedSec;
  }
  return null;
}

/** Lama menunggu hijau bagi kendaraan yang tiba pada jam bersama `atSec`. */
export function waitForGreen(plan: SignalPlan, approachId: string, atSec: number): number {
  const win = greenWindow(plan, approachId);
  if (!win) return 0;
  const local = mod(atSec - plan.offsetSec, plan.cycleSec);
  if (local >= win.start && local < win.end) return 0;
  return mod(win.start - local, plan.cycleSec);
}

/** Jam bersama saat hijau tambahan pendekat `approachId` berakhir (setelah `afterSec`). */
export function greenEndAfter(plan: SignalPlan, approachId: string, afterSec: number): number {
  const win = greenWindow(plan, approachId);
  if (!win) return afterSec;
  const local = mod(afterSec - plan.offsetSec, plan.cycleSec);
  return afterSec + mod(win.end - local, plan.cycleSec);
}

export function samePlan(a: SignalPlan, b: SignalPlan): boolean {
  return (
    a.offsetSec === b.offsetSec &&
    a.phases.length === b.phases.length &&
    a.phases.every((p, i) => p.approachId === b.phases[i].approachId && p.greenSec === b.phases[i].greenSec)
  );
}

/**
 * Satu langkah transisi menuju `target` tanpa melampaui `maxDelta` per fase dan
 * per offset. Dipakai rollback dan fail-safe bila rencana aktif sudah jauh dari
 * target; rencana antara tetap harus lolos guardrail.
 */
export function stepToward(current: SignalPlan, target: SignalPlan, maxDelta: number, source: PlanSource): SignalPlan {
  const clampStep = (from: number, to: number) => from + Math.max(-maxDelta, Math.min(maxDelta, to - from));
  const phases = current.phases.map((p, i) => ({
    ...p,
    greenSec: clampStep(p.greenSec, target.phases[i]?.greenSec ?? p.greenSec),
  }));
  const next = withPhases(current, phases, source);
  const dOffset = offsetDelta(current.offsetSec, target.offsetSec, next.cycleSec);
  return withOffset(next, current.offsetSec + Math.max(-maxDelta, Math.min(maxDelta, dOffset)), source);
}

/** Ringkasan perbedaan hijau terhadap rencana lain, mis. "+15 dtk hijau Barat". */
export function describeGreenDelta(label: string, delta: number): string {
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)} dtk hijau ${label}`;
}
