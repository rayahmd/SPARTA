// IntersectionAgent: satu agent per simpang. Loop tiap detik simulasi:
//   observe → (forecast dari Supervisor) → plan → guardrail → twin gate →
//   apply → broadcast notice → pantau (rollback / fail-safe)
// Tidak ada persetujuan operator di jalur ini. Operator hanya bisa menjeda
// atau memaksa siklus default (override), dan override pun lewat guardrail.

import { fnv1a } from "@/lib/sim/rng";
import { topics, type MessageBus } from "./bus";
import type { AgentConfig } from "./config";
import type { AgentGraph, NeighborLink } from "./graph";
import { checkPlan, describeViolations, guardOk } from "./guardrails";
import { approachById, dischargePerGreen, pressureOf, type IntersectionModel } from "./model";
import { greenEndAfter, samePlan, stepToward, waitForGreen } from "./plan";
import { fmt, relationToFlow, type Planner, type Proposal } from "./planner";
import type { Sensor } from "./sensor";
import { networkCost, type NetworkTerm, type TwinGate } from "./twin-gate";
import {
  AGENT_STATUS_LABELS,
  type ActiveChange,
  type AgentEventInput,
  type AgentSnapshot,
  type AgentStatus,
  type ChangeNotice,
  type Heartbeat,
  type IntersectionInfo,
  type NoticeReply,
  type Observation,
  type PlanSource,
  type ReplyAction,
  type ReplySummary,
  type SignalPlan,
  type TwinScore,
} from "./types";

export interface AgentDeps {
  cfg: AgentConfig;
  bus: MessageBus;
  graph: AgentGraph;
  planner: Planner;
  twin: TwinGate;
  emit: (event: AgentEventInput) => void;
  /** Prediksi kepadatan terbaru dari Supervisor (0..100). */
  forecast: () => number;
  autoMode: () => boolean;
  inCorridorGoal: () => boolean;
}

interface ChangeRecord {
  messageId: string;
  previousPlan: SignalPlan;
  appliedPlan: SignalPlan;
  appliedAtSec: number;
  monitorUntilSec: number;
  origin: "self" | "neighbor";
  originName: string;
  summary: string;
  reason: string;
  twin?: TwinScore;
  terms: NetworkTerm[];
  notified: string[];
  replies: ReplySummary[];
  liveSum: number;
  baseSum: number;
  samples: number;
  /** Detail rombongan yang diteruskan ke hilir (untuk notice berikutnya). */
  platoon?: { sizeVeh: number; passAtSec: number };
  reverted: boolean;
}

export class IntersectionAgent {
  readonly id: string;
  readonly name: string;
  model: IntersectionModel;
  plan: SignalPlan;
  status: AgentStatus = "normal";
  paused = false;
  /** Injeksi gangguan: false = agent berhenti mengirim heartbeat (pengendali mati). */
  heartbeatEnabled = true;
  cooldownUntilSec = 0;
  nextDecisionAtSec: number;

  private now = 0;
  private readonly startedAtSec: number;
  private lastHeartbeatSentSec = -Infinity;
  private lastHeartbeat = new Map<string, number>();
  private seen = new Map<string, number>();
  private revertsSeen = new Set<string>();
  private changes = new Map<string, ChangeRecord>();
  private monitoring: ChangeRecord | null = null;
  private latest: ChangeRecord | null = null;
  private lastDecision: AgentSnapshot["lastDecision"] = null;
  private lastRejectedKey: string | null = null;
  private counter = 0;
  private prevQueue: number | null = null;
  private lastObs: Observation | null = null;
  private sensorLostSince: number | null = null;
  private healthySince: number | null = null;
  private transitionTarget: { plan: SignalPlan; source: PlanSource; nextStepAtSec: number } | null = null;
  private unsubscribe: (() => void)[] = [];

  constructor(
    info: IntersectionInfo,
    model: IntersectionModel,
    private sensor: Sensor,
    private readonly deps: AgentDeps,
    startAtSec = 0,
  ) {
    this.id = info.id;
    this.name = info.name;
    this.model = model;
    this.plan = model.defaultPlan;
    this.now = startAtSec;
    this.startedAtSec = startAtSec;
    // Keputusan pertama digeser per simpang supaya agent tidak serempak.
    this.nextDecisionAtSec = startAtSec + 5 + (fnv1a(model.simKey) % model.defaultPlan.cycleSec);

    const { bus } = deps;
    this.unsubscribe.push(
      bus.subscribe(topics.notice(this.id), (p) => this.handleNotice(p as ChangeNotice)),
      bus.subscribe(topics.reply(this.id), (p) => this.handleReply(p as NoticeReply)),
    );
    for (const link of this.links()) {
      this.unsubscribe.push(
        bus.subscribe(topics.heartbeat(link.id), (p) => {
          this.lastHeartbeat.set((p as Heartbeat).agentId, this.now);
        }),
      );
    }
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
  }

  private get cfg(): AgentConfig {
    return this.deps.cfg;
  }

  private links(): NeighborLink[] {
    return this.deps.graph.neighbors.get(this.id) ?? [];
  }

  private nameOf(id: string): string {
    return this.deps.graph.nodes.get(id)?.name ?? id;
  }

  private emit(event: Omit<AgentEventInput, "agentId" | "agentName">): void {
    this.deps.emit({ agentId: this.id, agentName: this.name, ...event });
  }

  // ─── Loop utama ──────────────────────────────────────────────────────────

  tick(nowSec: number): void {
    this.now = nowSec;

    if (this.heartbeatEnabled && nowSec - this.lastHeartbeatSentSec >= this.cfg.heartbeatIntervalSec) {
      this.lastHeartbeatSentSec = nowSec;
      const hb: Heartbeat = { agentId: this.id, status: this.status, atSec: nowSec };
      this.deps.bus.publish(topics.heartbeat(this.id), hb);
    }

    // observe
    const obs = this.sensor.read();
    const { fault, healthy } = this.checkHealth(obs);
    if (obs) this.lastObs = obs;

    if (this.status !== "failsafe" && fault) {
      this.enterFailsafe(fault);
    } else if (this.status === "failsafe") {
      if (healthy) {
        this.healthySince ??= nowSec;
        const recoverSec = this.cfg.cooldownCycles * this.model.defaultPlan.cycleSec;
        if (nowSec - this.healthySince >= recoverSec) this.exitFailsafe(nowSec - this.healthySince);
      } else {
        this.healthySince = null;
      }
    }

    this.stepTransition();
    if (obs && this.monitoring) this.monitor(obs);

    if (nowSec >= this.nextDecisionAtSec) {
      this.nextDecisionAtSec = nowSec + this.plan.cycleSec;
      if (
        this.status !== "failsafe" &&
        !this.paused &&
        this.deps.autoMode() &&
        !this.monitoring &&
        !this.transitionTarget &&
        nowSec >= this.cooldownUntilSec
      ) {
        this.decide();
      }
    }

    if (this.seen.size > 500) {
      for (const [id, at] of this.seen) if (nowSec - at > 2 * this.cfg.noticeTtlSec) this.seen.delete(id);
    }
  }

  private checkHealth(obs: Observation | null): { fault: string | null; healthy: boolean } {
    const { heartbeatTimeoutSec, anomalyJumpVeh } = this.cfg;
    let fault: string | null = null;

    if (!obs) {
      this.sensorLostSince ??= this.now;
      const lost = this.now - this.sensorLostSince;
      if (lost > heartbeatTimeoutSec) fault = `Sensor tidak mengirim data selama ${lost} dtk`;
    } else {
      this.sensorLostSince = null;
      const values = [obs.queueTotal, ...Object.values(obs.queueByApproach)];
      if (values.some((v) => !Number.isFinite(v) || v < 0)) {
        fault = "Metrik anomali: nilai antrean tidak valid";
      } else if (this.prevQueue !== null && obs.queueTotal - this.prevQueue > anomalyJumpVeh) {
        fault = `Metrik anomali: antrean melonjak +${Math.round(obs.queueTotal - this.prevQueue)} kend dalam 1 dtk`;
      }
      this.prevQueue = Number.isFinite(obs.queueTotal) ? obs.queueTotal : this.prevQueue;
    }

    if (!fault) {
      for (const link of this.links()) {
        const last = this.lastHeartbeat.get(link.id) ?? this.startedAtSec;
        const silent = this.now - last;
        if (silent > heartbeatTimeoutSec) {
          fault = `Heartbeat ${this.nameOf(link.id)} hilang ${silent} dtk`;
          break;
        }
      }
    }
    return { fault, healthy: !fault && !!obs };
  }

  // ─── Keputusan sendiri ───────────────────────────────────────────────────

  private plannerContext() {
    return {
      agentId: this.id,
      name: this.name,
      model: this.model,
      plan: this.plan,
      observation: this.lastObs,
      forecast: this.deps.forecast(),
      nowSec: this.now,
      cfg: this.cfg,
      inCorridorGoal: this.deps.inCorridorGoal(),
    };
  }

  private decide(): void {
    const proposal = this.deps.planner.propose(this.plannerContext());
    if (!proposal) return;
    const key = `${proposal.plan.phases.map((p) => p.greenSec).join(",")}@${proposal.plan.offsetSec}`;

    const guard = checkPlan(proposal.plan, this.plan, this.cfg);
    if (!guardOk(guard)) {
      this.reject(key, `${this.name}: ${proposal.summary} ditolak guardrail.`, describeViolations(guard));
      return;
    }
    const verdict = this.deps.twin.evaluate(this.model, this.plan, proposal.plan, proposal.terms);
    if (!verdict.passed) {
      this.reject(
        key,
        `${this.name}: ${proposal.summary} ditolak twin gate.`,
        `Perbaikan twin ${fmt(verdict.improvementPct)}% < ambang ${this.cfg.twinMinImprovementPct}%. ${proposal.reason}`,
        verdict,
      );
      return;
    }

    const messageId = `${this.model.simKey}-${++this.counter}`;
    const flowBearing = (approachById(this.model, proposal.approachId)!.bearingDeg + 180) % 360;
    const targets = this.noticeTargets(flowBearing, []);
    const record = this.applyChange(proposal, messageId, "self", this.name, verdict, "agent");
    this.lastRejectedKey = null;
    this.lastDecision = { summary: `${proposal.summary}, diterapkan otomatis`, atSec: this.now, applied: true };
    this.emit({
      type: "decision_applied",
      messageId,
      summary: `${this.name}: ${proposal.summary}, diterapkan. Notice ke ${targets.length} simpang tetangga.`,
      reason: proposal.reason,
      twin: scoreOf(verdict),
    });

    const approach = approachById(this.model, proposal.approachId)!;
    const passAtSec = greenEndAfter(this.plan, proposal.approachId, this.now);
    record.platoon = { sizeVeh: dischargePerGreen(approach, proposal.deltaGreenSec) * approach.through, passAtSec };
    this.sendNotices(record, proposal, flowBearing, targets, 1, this.id, this.name);
  }

  private reject(key: string, summary: string, reason: string, twin?: TwinScore): void {
    this.lastDecision = { summary, atSec: this.now, applied: false };
    // Calon yang sama ditolak lagi tiap siklus; cukup dicatat sekali.
    if (key === this.lastRejectedKey) return;
    this.lastRejectedKey = key;
    this.emit({ type: "decision_rejected", summary, reason, twin: twin ? scoreOf(twin) : undefined });
  }

  private applyChange(
    proposal: Proposal,
    messageId: string,
    origin: "self" | "neighbor",
    originName: string,
    verdict: TwinScore,
    source: PlanSource,
  ): ChangeRecord {
    const previousPlan = this.plan;
    const appliedPlan = { ...proposal.plan, source };
    const record: ChangeRecord = {
      messageId,
      previousPlan,
      appliedPlan,
      appliedAtSec: this.now,
      monitorUntilSec: this.now + this.cfg.rollbackWindowSec,
      origin,
      originName,
      summary: proposal.summary,
      reason: proposal.reason,
      twin: scoreOf(verdict),
      terms: proposal.terms,
      notified: [],
      replies: [],
      liveSum: 0,
      baseSum: 0,
      samples: 0,
      reverted: false,
    };
    this.setPlan(appliedPlan, true);
    this.changes.set(messageId, record);
    this.monitoring = record;
    this.latest = record;
    this.status = "adjusting";
    this.cooldownUntilSec = this.now + this.cfg.cooldownCycles * appliedPlan.cycleSec;
    return record;
  }

  private setPlan(plan: SignalPlan, counterfactual: boolean): void {
    this.plan = plan;
    this.sensor.applyPlan(plan, { counterfactual });
  }

  /** Tetangga di hulu/hilir arus `flowBearing`, kecuali `exclude`. */
  private noticeTargets(flowBearing: number, exclude: string[]): NeighborLink[] {
    return this.links().filter(
      (link) =>
        !exclude.includes(link.id) && relationToFlow((link.bearingDeg + 180) % 360, flowBearing) !== "lateral",
    );
  }

  private sendNotices(
    record: ChangeRecord,
    proposal: Proposal,
    flowBearing: number,
    targets: NeighborLink[],
    hop: number,
    originId: string,
    originName: string,
  ): void {
    for (const link of targets) {
      const downstream = relationToFlow((link.bearingDeg + 180) % 360, flowBearing) === "downstream";
      const platoon = record.platoon && downstream ? record.platoon : null;
      const notice: ChangeNotice = {
        messageId: record.messageId,
        kind: "apply",
        originId,
        originName,
        fromId: this.id,
        fromName: this.name,
        toId: link.id,
        hop,
        ttlSec: this.cfg.noticeTtlSec,
        sentAtSec: this.now,
        change: {
          approachId: proposal.approachId,
          approachLabel: proposal.approachLabel,
          deltaGreenSec: proposal.deltaGreenSec,
          deltaOffsetSec: proposal.deltaOffsetSec,
          flowBearingDeg: flowBearing,
          summary: proposal.summary,
        },
        platoon: {
          sizeVeh: platoon ? round1(platoon.sizeVeh) : 0,
          arrivalAtSec: platoon ? platoon.passAtSec + link.travelTimeSec : this.now,
          travelTimeSec: link.travelTimeSec,
        },
        senderPressure: round2(proposal.pressure),
      };
      record.notified.push(link.id);
      this.deps.bus.publish(topics.notice(link.id), notice);
      this.emit({
        type: "notice_sent",
        messageId: record.messageId,
        targetId: link.id,
        targetName: this.nameOf(link.id),
        hop,
        summary: `Notice ${this.name} → ${this.nameOf(link.id)} (hop ${hop}): ${proposal.summary}.`,
      });
    }
  }

  // ─── Pesan dari tetangga ─────────────────────────────────────────────────

  private handleNotice(notice: ChangeNotice): void {
    if (notice.toId !== this.id) return;
    if (notice.kind === "revert") return this.handleRevert(notice);
    if (notice.kind === "failsafe") {
      this.reply(notice, "accept", "Dicatat; rencana simpang ini tidak diubah");
      return;
    }

    const ignore = (reason: string) =>
      this.emit({
        type: "notice_ignored",
        messageId: notice.messageId,
        targetId: notice.fromId,
        targetName: notice.fromName,
        hop: notice.hop,
        summary: `${this.name}: notice dari ${notice.fromName} diabaikan.`,
        reason,
      });

    if (this.seen.has(notice.messageId) || this.changes.has(notice.messageId)) {
      ignore(`Duplikat gelombang ${notice.messageId} (sudah diproses), dibuang untuk mencegah loop`);
      return;
    }
    this.seen.set(notice.messageId, this.now);
    if (this.now > notice.sentAtSec + notice.ttlSec) return ignore("Notice kedaluwarsa (ttl habis)");
    if (notice.hop > this.cfg.maxHops) return ignore(`Hop ${notice.hop} melewati batas ${this.cfg.maxHops}`);

    if (this.paused) return this.reply(notice, "reject", "Agent dijeda operator");
    if (this.status === "failsafe") return this.reply(notice, "reject", "Simpang sedang Fail-Safe");
    if (!this.deps.autoMode()) return this.reply(notice, "reject", "Mode otomatis dimatikan operator");
    if (this.now < this.cooldownUntilSec || this.monitoring) {
      return this.reply(
        notice,
        "reject",
        `Cooldown: simpang ini baru berubah, boleh berubah lagi setelah ${Math.max(0, Math.ceil(this.cooldownUntilSec - this.now))} dtk`,
      );
    }

    const link = this.links().find((l) => l.id === notice.fromId);
    if (!link) return this.reply(notice, "reject", "Pengirim bukan tetangga langsung");
    const decision = this.deps.planner.respond({
      ...this.plannerContext(),
      notice,
      bearingToSender: link.bearingDeg,
    });
    if (decision.action === "reject") return this.reply(notice, "reject", decision.reason);

    let best: { proposal: Proposal; verdict: TwinScore & { passed: boolean } } | null = null;
    let firstFailure: { reason: string; twin?: TwinScore } | null = null;
    for (const proposal of decision.candidates) {
      const guard = checkPlan(proposal.plan, this.plan, this.cfg);
      if (!guardOk(guard)) {
        firstFailure ??= { reason: `Guardrail: ${describeViolations(guard)}` };
        continue;
      }
      const verdict = this.deps.twin.evaluate(this.model, this.plan, proposal.plan, proposal.terms);
      if (!verdict.passed) {
        firstFailure ??= {
          reason: `Twin gate lokal: perbaikan ${fmt(verdict.improvementPct)}% < ambang ${this.cfg.twinMinImprovementPct}% untuk ${proposal.summary}`,
          twin: scoreOf(verdict),
        };
        continue;
      }
      if (!best || verdict.improvementPct > best.verdict.improvementPct) best = { proposal, verdict };
    }
    if (!best) {
      return this.reply(notice, "reject", firstFailure?.reason ?? "Tidak ada calon rencana", undefined, firstFailure?.twin);
    }

    const { proposal, verdict } = best;
    const record = this.applyChange(proposal, notice.messageId, "neighbor", notice.originName, verdict, "neighbor");
    this.lastDecision = { summary: `${proposal.summary}, menyesuaikan ${notice.fromName}`, atSec: this.now, applied: true };

    // Rombongan yang lolos di simpang ini diteruskan ke hilir berikutnya.
    const flowBearing =
      proposal.deltaOffsetSec !== 0
        ? notice.change.flowBearingDeg
        : (approachById(this.model, proposal.approachId)!.bearingDeg + 180) % 360;
    if (proposal.deltaOffsetSec !== 0) {
      const arrival = notice.platoon.arrivalAtSec;
      record.platoon = {
        sizeVeh: notice.platoon.sizeVeh * this.cfg.platoonDispersion,
        passAtSec: arrival + waitForGreen(this.plan, proposal.approachId, arrival),
      };
    }
    const canForward = notice.hop < this.cfg.maxHops;
    const targets = canForward ? this.noticeTargets(flowBearing, [notice.fromId, notice.originId]) : [];
    const further = this.noticeTargets(flowBearing, [notice.fromId, notice.originId]);
    const propagation = canForward
      ? targets.length > 0
        ? `Diteruskan ke ${targets.map((t) => this.nameOf(t.id)).join(", ")} (hop ${notice.hop + 1}).`
        : "Tidak ada tetangga lain untuk diteruskan."
      : further.length > 0
        ? `Batas ${this.cfg.maxHops} hop tercapai, tidak diteruskan ke ${further.map((t) => this.nameOf(t.id)).join(", ")}.`
        : `Batas ${this.cfg.maxHops} hop tercapai.`;

    this.emit({
      type: "neighbor_adjusted",
      messageId: notice.messageId,
      targetId: notice.fromId,
      targetName: notice.fromName,
      hop: notice.hop,
      summary: `${this.name}: ${proposal.summary}, menyesuaikan perubahan ${notice.originName}.`,
      reason: `${proposal.reason} ${propagation}`,
      twin: scoreOf(verdict),
    });
    this.reply(notice, decision.action, proposal.reason, proposal.summary, scoreOf(verdict));
    if (targets.length > 0) {
      this.sendNotices(record, proposal, flowBearing, targets, notice.hop + 1, notice.originId, notice.originName);
    }
  }

  private reply(notice: ChangeNotice, action: ReplyAction, reason: string, detail?: string, twin?: TwinScore): void {
    const reply: NoticeReply = {
      messageId: notice.messageId,
      kind: notice.kind,
      fromId: this.id,
      fromName: this.name,
      toId: notice.fromId,
      action,
      reason,
      detail,
      twin,
      hop: notice.hop,
    };
    this.deps.bus.publish(topics.reply(notice.fromId), reply);
  }

  private handleReply(reply: NoticeReply): void {
    if (reply.toId !== this.id) return;
    const record = this.changes.get(reply.messageId);
    record?.replies.push({
      agentId: reply.fromId,
      agentName: reply.fromName,
      action: reply.action,
      reason: reply.reason,
      detail: reply.detail,
      hop: reply.hop,
    });
    const what =
      reply.kind === "failsafe" ? "notice fail-safe dicatat" : reply.detail ? `${reply.action}, ${reply.detail}` : reply.action;
    this.emit({
      type: "reply_received",
      messageId: reply.messageId,
      targetId: reply.fromId,
      targetName: reply.fromName,
      hop: reply.hop,
      reply: reply.action,
      summary: `${reply.fromName} → ${this.name}: ${what}.`,
      reason: reply.reason,
      twin: reply.twin,
    });
  }

  private handleRevert(notice: ChangeNotice): void {
    if (this.revertsSeen.has(notice.messageId)) return;
    this.revertsSeen.add(notice.messageId);
    const record = this.changes.get(notice.messageId);
    if (!record || record.reverted || record.origin !== "neighbor") return;
    if (!samePlan(this.plan, record.appliedPlan)) return;
    this.revert(record, "rollback");
    this.emit({
      type: "rollback",
      messageId: record.messageId,
      targetId: notice.fromId,
      targetName: notice.fromName,
      summary: `${this.name}: ${record.summary} ikut dikembalikan karena ${notice.originName} rollback.`,
      reason: "Revert berantai hanya ke simpang yang ikut berubah pada gelombang yang sama.",
    });
    this.sendReverts(record, notice.originId, notice.originName);
  }

  private sendReverts(record: ChangeRecord, originId: string, originName: string): void {
    for (const id of record.notified) {
      const notice: ChangeNotice = {
        messageId: record.messageId,
        kind: "revert",
        originId,
        originName,
        fromId: this.id,
        fromName: this.name,
        toId: id,
        hop: 1,
        ttlSec: this.cfg.noticeTtlSec,
        sentAtSec: this.now,
        change: {
          approachId: "",
          approachLabel: "",
          deltaGreenSec: 0,
          deltaOffsetSec: 0,
          flowBearingDeg: 0,
          summary: `revert ${record.summary}`,
        },
        platoon: { sizeVeh: 0, arrivalAtSec: this.now, travelTimeSec: 0 },
        senderPressure: 0,
      };
      this.deps.bus.publish(topics.notice(id), notice);
    }
  }

  // ─── Pemantauan, rollback, fail-safe ─────────────────────────────────────

  private monitor(obs: Observation): void {
    const record = this.monitoring!;
    const base = this.sensor.counterfactualQueue() ?? obs.queueTotal;
    record.liveSum += obs.queueTotal + networkCost(this.model, record.appliedPlan, record.terms, this.cfg);
    record.baseSum += base + networkCost(this.model, record.previousPlan, record.terms, this.cfg);
    record.samples++;
    if (this.now < record.monitorUntilSec) return;

    this.monitoring = null;
    this.sensor.endCounterfactual();
    this.status = "normal";
    const live = record.liveSum / Math.max(1, record.samples);
    const base2 = record.baseSum / Math.max(1, record.samples);
    const worsePct = base2 > 0 ? ((live - base2) / base2) * 100 : 0;
    if (worsePct <= this.cfg.rollbackWorsePct) return;

    this.revert(record, "rollback");
    const affected = record.notified.length;
    this.emit({
      type: "rollback",
      messageId: record.messageId,
      summary: `${this.name}: rollback ${record.summary}. Revert ke ${affected} simpang tetangga.`,
      reason:
        `Dalam ${this.cfg.rollbackWindowSec} dtk skor ${fmt(live)} vs baseline rencana lama ${fmt(base2)} ` +
        `(+${fmt(worsePct)}% > ${this.cfg.rollbackWorsePct}%).`,
    });
    this.sendReverts(record, this.id, this.name);
  }

  private revert(record: ChangeRecord, source: PlanSource): void {
    record.reverted = true;
    if (this.monitoring === record) {
      this.monitoring = null;
      this.sensor.endCounterfactual();
    }
    this.moveTo(record.previousPlan, source);
    this.status = this.status === "failsafe" ? "failsafe" : "normal";
    this.cooldownUntilSec = this.now + this.cfg.cooldownCycles * this.plan.cycleSec;
  }

  /** Pindah ke `target`: langsung bila lolos guardrail, bertahap bila selisihnya terlalu besar. */
  private moveTo(target: SignalPlan, source: PlanSource): void {
    const tagged = { ...target, source };
    if (guardOk(checkPlan(tagged, this.plan, this.cfg))) {
      this.transitionTarget = null;
      this.setPlan(tagged, false);
      return;
    }
    this.transitionTarget = { plan: tagged, source, nextStepAtSec: this.now };
    this.stepTransition();
  }

  private stepTransition(): void {
    const t = this.transitionTarget;
    if (!t || this.now < t.nextStepAtSec) return;
    const next = stepToward(this.plan, t.plan, this.cfg.maxDeltaPerCycleSec, t.source);
    if (!guardOk(checkPlan(next, this.plan, this.cfg))) {
      // Rencana antara tidak aman: tahan rencana sekarang, coba lagi siklus berikut.
      t.nextStepAtSec = this.now + this.plan.cycleSec;
      return;
    }
    this.setPlan(next, false);
    if (samePlan(next, t.plan)) this.transitionTarget = null;
    else t.nextStepAtSec = this.now + next.cycleSec;
  }

  private enterFailsafe(reason: string): void {
    this.status = "failsafe";
    this.healthySince = null;
    if (this.monitoring) {
      this.monitoring = null;
      this.sensor.endCounterfactual();
    }
    this.moveTo(this.model.defaultPlan, "failsafe");
    const messageId = `${this.model.simKey}-fs-${++this.counter}`;
    const links = this.links();
    this.emit({
      type: "failsafe_enter",
      messageId,
      summary: `${this.name} masuk Fail-Safe, kembali ke siklus default. Notice ke ${links.length} simpang tetangga.`,
      reason,
    });
    for (const link of links) {
      const notice: ChangeNotice = {
        messageId,
        kind: "failsafe",
        originId: this.id,
        originName: this.name,
        fromId: this.id,
        fromName: this.name,
        toId: link.id,
        hop: 1,
        ttlSec: this.cfg.noticeTtlSec,
        sentAtSec: this.now,
        change: { approachId: "", approachLabel: "", deltaGreenSec: 0, deltaOffsetSec: 0, flowBearingDeg: 0, summary: "fail-safe" },
        platoon: { sizeVeh: 0, arrivalAtSec: this.now, travelTimeSec: link.travelTimeSec },
        senderPressure: 0,
      };
      this.deps.bus.publish(topics.notice(link.id), notice);
    }
  }

  private exitFailsafe(healthyForSec: number): void {
    this.status = "normal";
    this.healthySince = null;
    this.cooldownUntilSec = this.now + this.cfg.cooldownCycles * this.plan.cycleSec;
    this.emit({
      type: "failsafe_exit",
      summary: `${this.name} pulih dari Fail-Safe secara otomatis.`,
      reason: `Sensor dan heartbeat tetangga normal selama ${healthyForSec} dtk (cooldown ${this.cfg.cooldownCycles} siklus).`,
    });
  }

  // ─── Override operator (human-on-the-loop) ───────────────────────────────

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** Paksa siklus default; agent dijeda sampai operator melanjutkan. */
  forceDefault(): { gradual: boolean } {
    const active = this.monitoring ?? (this.latest && !this.latest.reverted ? this.latest : null);
    if (active && samePlan(this.plan, active.appliedPlan)) {
      active.reverted = true;
      this.sendReverts(active, this.id, this.name);
    }
    if (this.monitoring) {
      this.monitoring = null;
      this.sensor.endCounterfactual();
    }
    this.moveTo(this.model.defaultPlan, "override");
    if (this.status === "adjusting") this.status = "normal";
    this.paused = true;
    return { gradual: this.transitionTarget !== null };
  }

  /** Ganti model twin (prediksi berubah). Ditunda selama pemantauan. */
  rebuildModel(model: IntersectionModel, sensorFactory: (m: IntersectionModel) => Sensor): boolean {
    if (this.monitoring || this.transitionTarget) return false;
    // Rencana default dan offset koordinasi tetap; hanya volume twin yang berubah.
    model.defaultPlan = { ...model.defaultPlan, offsetSec: this.model.defaultPlan.offsetSec };
    this.model = model;
    this.sensor = sensorFactory(model);
    this.sensor.applyPlan(this.plan, { counterfactual: false });
    this.prevQueue = null;
    return true;
  }

  get sensorRef(): Sensor {
    return this.sensor;
  }

  snapshot(): AgentSnapshot {
    const record = this.latest;
    const activeChange: ActiveChange | null =
      record && !record.reverted
        ? {
            messageId: record.messageId,
            summary: record.summary,
            reason: record.reason,
            appliedAtSec: record.appliedAtSec,
            twin: record.twin,
            origin: record.origin,
            originName: record.originName,
            replies: record.replies.slice(),
          }
        : null;
    const info = this.deps.graph.nodes.get(this.id)!;
    return {
      id: this.id,
      name: this.name,
      lat: info.lat,
      lng: info.lng,
      status: this.status,
      statusLabel: this.paused ? "Dijeda" : AGENT_STATUS_LABELS[this.status],
      paused: this.paused,
      plan: this.plan,
      defaultPlan: this.model.defaultPlan,
      forecast: Math.round(this.deps.forecast()),
      queueNow: this.lastObs?.queueTotal ?? 0,
      cooldownUntilSec: this.cooldownUntilSec,
      neighbors: this.links().map((l) => l.id),
      aliasIds: info.aliasIds ?? [],
      activeChange,
      lastDecision: this.lastDecision,
    };
  }

  /** Tekanan pendekat pada rencana aktif (untuk test dan UI). */
  pressure(approachId: string): number {
    return pressureOf(this.model, this.plan, approachId);
  }
}

function scoreOf(v: TwinScore): TwinScore {
  return { currentScore: v.currentScore, candidateScore: v.candidateScore, improvementPct: v.improvementPct };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
