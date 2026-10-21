// Planner: menyusun calon rencana sinyal. Planner hanya MENGUSULKAN; setiap
// calon tetap harus lolos guardrail dan twin gate di IntersectionAgent.
// HeuristicPlanner deterministik (prediksi + antrean lokal). LlmPlanner
// disediakan di balik interface yang sama tetapi tidak aktif.

import type { AgentConfig } from "./config";
import { angleDiff } from "./graph";
import { dischargePerGreen, nearestApproach, pressureOf, type IntersectionModel } from "./model";
import { describeGreenDelta, phaseIndex, shiftGreen, waitForGreen, withOffset } from "./plan";
import type { NetworkTerm } from "./twin-gate";
import type { ChangeNotice, Observation, SignalPlan } from "./types";

export interface PlannerContext {
  agentId: string;
  name: string;
  model: IntersectionModel;
  plan: SignalPlan;
  observation: Observation | null;
  forecast: number;
  nowSec: number;
  cfg: AgentConfig;
  /** Simpang termasuk koridor yang diprioritaskan Supervisor. */
  inCorridorGoal: boolean;
}

export interface Proposal {
  plan: SignalPlan;
  approachId: string;
  approachLabel: string;
  deltaGreenSec: number;
  deltaOffsetSec: number;
  /** Ringkas, mis. "+15 dtk hijau Barat". */
  summary: string;
  reason: string;
  /** Biaya jaringan yang ikut dinilai twin gate. */
  terms: NetworkTerm[];
  /** Tekanan pendekat yang diubah sebelum perubahan. */
  pressure: number;
}

export interface NoticeContext extends PlannerContext {
  notice: ChangeNotice;
  /** Arah dari simpang ini ke pengirim notice. */
  bearingToSender: number;
}

export type NoticeDecision =
  | { action: "reject"; reason: string }
  | { action: "accept" | "adjust"; candidates: Proposal[] };

export interface Planner {
  readonly name: string;
  propose(ctx: PlannerContext): Proposal | null;
  respond(ctx: NoticeContext): NoticeDecision;
}

/** Angka gaya Indonesia: koma desimal. */
export function fmt(value: number, decimals = 1): string {
  return value.toFixed(decimals).replace(".", ",");
}

/** Posisi penerima terhadap arus yang diubah pengirim. */
export function relationToFlow(bearingToSender: number, flowBearingDeg: number): "downstream" | "upstream" | "lateral" {
  const fromSender = (bearingToSender + 180) % 360;
  const d = angleDiff(fromSender, flowBearingDeg);
  if (d <= 70) return "downstream";
  if (d >= 110) return "upstream";
  return "lateral";
}

export class HeuristicPlanner implements Planner {
  readonly name = "heuristic";

  propose(ctx: PlannerContext): Proposal | null {
    const { model, plan, cfg, observation, forecast } = ctx;
    if (forecast < cfg.forecastTriggerLevel) return null;

    let best: { id: string; label: string; pressure: number; queue: number } | null = null;
    for (const a of model.approaches) {
      const i = phaseIndex(plan, a.id);
      if (i < 0) continue;
      const queue = observation?.queueByApproach[a.id] ?? 0;
      const queuePressure = queue / Math.max(1, dischargePerGreen(a, plan.phases[i].greenSec));
      const pressure =
        Math.max(pressureOf(model, plan, a.id), queuePressure) * (ctx.inCorridorGoal ? 1.05 : 1);
      if (!best || pressure > best.pressure + 1e-9) best = { id: a.id, label: a.label, pressure, queue };
    }
    if (!best || best.pressure < cfg.pressureTrigger) return null;

    const want = Math.min(cfg.maxDeltaPerCycleSec, forecast >= 80 ? 15 : forecast >= 70 ? 10 : 5);
    const { plan: next, applied } = shiftGreen(plan, best.id, want, cfg, "agent");
    if (applied <= 0) return null;

    return {
      plan: next,
      approachId: best.id,
      approachLabel: best.label,
      deltaGreenSec: applied,
      deltaOffsetSec: 0,
      summary: describeGreenDelta(best.label, applied),
      reason:
        `Prediksi kepadatan ${Math.round(forecast)}% dalam 30 menit; tekanan pendekat ${best.label} ` +
        `${fmt(best.pressure, 2)} (antrean ${Math.round(best.queue)} kend). ` +
        `Hijau diambil dari fase lain, siklus tetap ${next.cycleSec} dtk.`,
      terms: [],
      pressure: best.pressure,
    };
  }

  respond(ctx: NoticeContext): NoticeDecision {
    const { notice, model, plan, cfg } = ctx;
    const relation = relationToFlow(ctx.bearingToSender, notice.change.flowBearingDeg);

    if (relation === "downstream") {
      // Hilir: rombongan tambahan dari pengirim tiba di lengan yang menghadap
      // pengirim. Geser offset (maks. batas per siklus) supaya tiba saat hijau.
      const arm = nearestApproach(model, ctx.bearingToSender);
      if (notice.platoon.sizeVeh < 0.5) return { action: "reject", reason: "Rombongan dari hulu tidak bertambah" };
      const arrival = notice.platoon.arrivalAtSec;
      const wait0 = waitForGreen(plan, arm.id, arrival);
      if (wait0 === 0) {
        return { action: "reject", reason: `Rombongan sudah tiba saat hijau ${arm.label}, offset tidak perlu diubah` };
      }
      let bestShift = 0;
      let bestWait = wait0;
      for (let s = 1; s <= cfg.maxDeltaPerCycleSec; s++) {
        for (const shift of [-s, s]) {
          const w = waitForGreen(withOffset(plan, plan.offsetSec + shift, "neighbor"), arm.id, arrival);
          if (w < bestWait) {
            bestWait = w;
            bestShift = shift;
          }
        }
      }
      if (bestShift === 0) {
        return {
          action: "reject",
          reason: `Geser offset ≤${cfg.maxDeltaPerCycleSec} dtk tidak membuat rombongan tiba saat hijau ${arm.label}`,
        };
      }
      const sign = bestShift > 0 ? "+" : "−";
      return {
        action: "accept",
        candidates: [
          {
            plan: withOffset(plan, plan.offsetSec + bestShift, "neighbor"),
            approachId: arm.id,
            approachLabel: arm.label,
            deltaGreenSec: 0,
            deltaOffsetSec: bestShift,
            summary: `geser offset ${sign}${Math.abs(bestShift)} dtk`,
            reason:
              `Rombongan ±${Math.round(notice.platoon.sizeVeh)} kend dari ${notice.fromName} tiba dalam ` +
              `${notice.platoon.travelTimeSec} dtk; tunggu merah di lengan ${arm.label} turun ${Math.round(wait0)} → ${Math.round(bestWait)} dtk.`,
            terms: [{ kind: "platoon", approachId: arm.id, sizeVeh: notice.platoon.sizeVeh, arrivalAtSec: arrival }],
            pressure: pressureOf(model, plan, arm.id),
          },
        ],
      };
    }

    if (relation === "upstream") {
      // Hulu: pengirim sedang jenuh; kurangi pelepasan ke arahnya supaya
      // antrean tidak merambat balik. Lengan pelepas = sisi seberang pengirim.
      if (notice.senderPressure <= cfg.spillbackPressure) {
        return { action: "reject", reason: `${notice.fromName} tidak jenuh, pelepasan tidak perlu dikurangi` };
      }
      const arm = nearestApproach(model, (ctx.bearingToSender + 180) % 360);
      const terms: NetworkTerm[] = [{ kind: "spillback", approachId: arm.id, downstreamPressure: notice.senderPressure }];
      const candidates: Proposal[] = [];
      for (const step of [5, 10]) {
        if (step > cfg.maxDeltaPerCycleSec) continue;
        const { plan: next, applied } = shiftGreen(plan, arm.id, -step, cfg, "neighbor");
        if (applied === 0) continue;
        candidates.push({
          plan: next,
          approachId: arm.id,
          approachLabel: arm.label,
          deltaGreenSec: applied,
          deltaOffsetSec: 0,
          summary: `${describeGreenDelta(arm.label, applied)} (kurangi pelepasan ke ${notice.fromName})`,
          reason:
            `${notice.fromName} jenuh (tekanan ${fmt(notice.senderPressure, 2)}); hijau ${arm.label} dikurangi ` +
            `supaya antrean tidak merambat balik.`,
          terms,
          pressure: notice.senderPressure,
        });
      }
      if (candidates.length === 0) return { action: "reject", reason: `Hijau ${arm.label} sudah di batas bawah` };
      return { action: "adjust", candidates };
    }

    return { action: "reject", reason: "Simpang ini tidak searah arus yang diubah" };
  }
}

/**
 * Stub planner berbasis LLM di balik interface yang sama. Sengaja tidak
 * aktif: keputusan demo harus deterministik dan bisa diaudit. Bila diaktifkan
 * nanti, keluarannya tetap wajib lewat guardrail dan twin gate.
 */
export class LlmPlanner implements Planner {
  readonly name = "llm";

  constructor(readonly opts: { model?: string; endpoint?: string } = {}) {}

  /** Prompt yang akan dikirim ke model; dipisah supaya bisa diuji tanpa jaringan. */
  buildPrompt(ctx: PlannerContext): string {
    const phases = ctx.plan.phases.map((p) => `${p.label}: hijau ${p.greenSec} dtk`).join("; ");
    return [
      `Simpang ${ctx.name}. Prediksi kepadatan ${Math.round(ctx.forecast)}%.`,
      `Rencana saat ini: ${phases}; siklus ${ctx.plan.cycleSec} dtk, offset ${ctx.plan.offsetSec} dtk.`,
      `Usulkan perubahan hijau maks. ${ctx.cfg.maxDeltaPerCycleSec} dtk per fase dalam JSON.`,
    ].join("\n");
  }

  propose(): Proposal | null {
    return null;
  }

  respond(): NoticeDecision {
    return { action: "reject", reason: "LLM planner belum diaktifkan" };
  }
}
