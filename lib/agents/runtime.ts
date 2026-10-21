// Runtime multi-agent: graf, bus, Supervisor, dan satu IntersectionAgent per
// simpang, digerakkan jam simulasi bersama. Jam maju per detik simulasi
// (deterministik); `advanceRealtime` mengubah waktu nyata menjadi detik
// simulasi dengan kelipatan 1x/2x/4x/8x seperti panel simulasi 3D.
//
// Tidak mengimpor Prisma atau Next.js: singleton server ada di ./server.ts.

import { InMemoryBus } from "./bus";
import { AGENT_CONFIG, type AgentConfig } from "./config";
import { shortName as short } from "./format";
import { buildGraph, type AgentGraph } from "./graph";
import { IntersectionAgent } from "./intersection-agent";
import { buildIntersectionModel, type IntersectionModel } from "./model";
import { withOffset } from "./plan";
import { HeuristicPlanner, type Planner } from "./planner";
import { CORRIDOR_SCENARIO, findCorridor, hotBearingFor, type Corridor } from "./scenario";
import { LiveTwinSensor, type Sensor } from "./sensor";
import { SupervisorAgent } from "./supervisor";
import { SimTwinGate, type TwinGate } from "./twin-gate";
import type {
  AgentEvent,
  AgentEventInput,
  IntersectionInfo,
  OverrideAction,
  RuntimeSnapshot,
  SimSpeed,
} from "./types";

export const SIM_SPEEDS: SimSpeed[] = [1, 2, 4, 8];
const EVENT_BUFFER = 400;
/** Waktu nyata maksimum yang dikejar sekali panggil (mis. setelah server tidur). */
const MAX_CATCHUP_REAL_SEC = 5;

export interface RuntimeOptions {
  intersections: IntersectionInfo[];
  forecasts?: Record<string, number>;
  forecastSource?: string;
  cfg?: AgentConfig;
  planner?: Planner;
  twin?: TwinGate;
  /** Pengganti sensor twin (test memakai sensor berskrip). */
  sensorFactory?: (model: IntersectionModel) => Sensor;
  warmupSec?: number;
  seed?: number;
  /** Pendekat kritis per simpang (arah lengan); default pilihan adapter. */
  hotBearings?: Record<string, number>;
  /** Offset koordinasi awal per simpang (dtk). */
  offsets?: Record<string, number>;
}

export interface OverrideCommand {
  action: OverrideAction;
  agentId?: string;
  enabled?: boolean;
  speed?: SimSpeed;
}

export class AgentRuntime {
  runId = "";
  simTimeSec = 0;
  speed: SimSpeed = 1;
  autoMode = true;
  persistence: "db" | "memory" = "memory";
  scenario: RuntimeSnapshot["scenario"] = null;

  cfg: AgentConfig = AGENT_CONFIG;
  graph!: AgentGraph;
  bus!: InMemoryBus;
  supervisor!: SupervisorAgent;
  agents: IntersectionAgent[] = [];

  private opts!: RuntimeOptions;
  private seq = 0;
  private runCounter = 0;
  private events: AgentEvent[] = [];
  private listeners = new Set<(event: AgentEvent) => void>();
  private lastRealMs: number | null = null;
  private accSec = 0;

  /** Dipanggil untuk tiap event (penyimpanan ke database). */
  onEvent: ((event: AgentEvent) => void) | null = null;

  constructor(opts: RuntimeOptions) {
    this.init(opts);
  }

  /** Mulai ulang semua agent dengan opsi baru; nomor urut event tetap naik. */
  reset(opts: Partial<RuntimeOptions> = {}): void {
    for (const agent of this.agents) agent.dispose();
    this.init({ ...this.opts, ...opts });
  }

  private init(opts: RuntimeOptions): void {
    this.opts = opts;
    this.cfg = opts.cfg ?? AGENT_CONFIG;
    this.runId = `run-${++this.runCounter}`;
    this.simTimeSec = 0;
    this.accSec = 0;
    this.lastRealMs = null;
    this.events = [];
    this.scenario = null;
    this.graph = buildGraph(opts.intersections, this.cfg);
    this.bus = new InMemoryBus(this.cfg.busLatencySec);
    this.supervisor = new SupervisorAgent();
    this.supervisor.setForecasts(opts.forecasts ?? {}, opts.forecastSource ?? "bawaan");

    const planner = opts.planner ?? new HeuristicPlanner();
    const twin = opts.twin ?? new SimTwinGate(this.cfg);
    this.agents = [...this.graph.nodes.values()].map((info) => {
      const model = this.buildModel(info, this.supervisor.forecastFor(info.id));
      const agent = new IntersectionAgent(info, model, this.makeSensor(model), {
        cfg: this.cfg,
        bus: this.bus,
        graph: this.graph,
        planner,
        twin,
        emit: (e) => this.record(e),
        forecast: () => this.supervisor.forecastFor(info.id),
        autoMode: () => this.autoMode,
        inCorridorGoal: () => this.supervisor.inCorridorGoal(info.id),
      });
      const offset = opts.offsets?.[info.id];
      if (offset !== undefined) {
        model.defaultPlan = withOffset(model.defaultPlan, offset, "default");
        agent.plan = model.defaultPlan;
      }
      return agent;
    });
  }

  private buildModel(info: IntersectionInfo, forecast: number): IntersectionModel {
    return buildIntersectionModel(info, forecast, {
      hotBearingDeg: this.opts.hotBearings?.[info.id],
      seed: this.opts.seed,
    });
  }

  private makeSensor(model: IntersectionModel): Sensor {
    return this.opts.sensorFactory?.(model) ?? new LiveTwinSensor(model, this.opts.warmupSec ?? 120);
  }

  agent(id: string): IntersectionAgent | undefined {
    return this.agents.find((a) => a.id === id);
  }

  /** Agent untuk sebuah pin, termasuk pin ganda (alias) di lokasi yang sama. */
  agentFor(nodeId: string): IntersectionAgent | undefined {
    return (
      this.agent(nodeId) ??
      this.agents.find((a) => this.graph.nodes.get(a.id)?.aliasIds?.includes(nodeId))
    );
  }

  // ─── Jam ─────────────────────────────────────────────────────────────────

  /** Majukan jam `seconds` detik simulasi (dibulatkan ke bawah). */
  step(seconds: number): void {
    const whole = Math.floor(seconds);
    for (let i = 0; i < whole; i++) {
      this.simTimeSec++;
      this.bus.deliverDue(this.simTimeSec);
      for (const agent of this.agents) {
        agent.sensorRef.advance(1);
        agent.tick(this.simTimeSec);
      }
    }
  }

  advanceRealtime(nowMs: number): void {
    if (this.lastRealMs === null) {
      this.lastRealMs = nowMs;
      return;
    }
    const dtReal = Math.min(MAX_CATCHUP_REAL_SEC, Math.max(0, (nowMs - this.lastRealMs) / 1000));
    this.lastRealMs = nowMs;
    this.accSec += dtReal * this.speed;
    const whole = Math.floor(this.accSec);
    this.accSec -= whole;
    if (whole > 0) this.step(whole);
  }

  /** Perbarui prediksi dari Supervisor; model twin agent dibangun ulang bila berubah berarti. */
  updateForecasts(values: Record<string, number>, source: string): void {
    if (this.scenario) return;
    this.supervisor.setForecasts(values, source);
    for (const agent of this.agents) {
      const info = this.graph.nodes.get(agent.id)!;
      const forecast = this.supervisor.forecastFor(agent.id);
      if (Math.abs(forecast - agent.model.forecast) < 5) continue;
      agent.rebuildModel(this.buildModel(info, forecast), (m) => this.makeSensor(m));
    }
  }

  // ─── Event ───────────────────────────────────────────────────────────────

  private record(input: AgentEventInput): void {
    const event: AgentEvent = {
      ...input,
      seq: ++this.seq,
      runId: this.runId,
      simTimeSec: this.simTimeSec,
      wallTime: new Date().toISOString(),
    };
    this.events.push(event);
    if (this.events.length > EVENT_BUFFER) this.events.splice(0, this.events.length - EVENT_BUFFER);
    this.onEvent?.(event);
    for (const listener of this.listeners) listener(event);
  }

  eventsSince(seq: number, limit = 200): AgentEvent[] {
    return this.events.filter((e) => e.seq > seq).slice(-limit);
  }

  recentEvents(limit = 60): AgentEvent[] {
    return this.events.slice(-limit);
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ─── Override operator dan skenario ──────────────────────────────────────

  override(cmd: OverrideCommand, operator = "Operator"): { ok: boolean; message: string } {
    const all = !cmd.agentId || cmd.agentId === "all";
    const targets = all ? this.agents : this.agents.filter((a) => a.id === cmd.agentId);
    const scope = all ? "semua simpang" : targets[0]?.name;
    const log = (summary: string, reason?: string) =>
      this.record({ type: "override", agentId: all ? "all" : targets[0].id, agentName: operator, summary, reason });

    switch (cmd.action) {
      case "auto_mode": {
        this.autoMode = cmd.enabled ?? !this.autoMode;
        const message = this.autoMode
          ? "Mode Otomatis dinyalakan: agent kembali memutuskan sendiri."
          : "Mode Otomatis dimatikan: agent mempertahankan rencana aktif dan tidak membuat keputusan baru.";
        log(`${operator}: ${message}`, "Override operator (human-on-the-loop).");
        return { ok: true, message };
      }
      case "speed": {
        if (!cmd.speed || !SIM_SPEEDS.includes(cmd.speed)) return { ok: false, message: "Kecepatan tidak valid" };
        this.speed = cmd.speed;
        return { ok: true, message: `Kecepatan jam simulasi ${cmd.speed}x` };
      }
      case "pause":
      case "resume": {
        if (targets.length === 0) return { ok: false, message: "Agent tidak ditemukan" };
        for (const agent of targets) agent.setPaused(cmd.action === "pause");
        const message =
          cmd.action === "pause"
            ? `Agent ${scope} dijeda. Rencana aktif dipertahankan, notice tetangga dibalas reject.`
            : `Agent ${scope} dilanjutkan.`;
        log(`${operator}: ${message}`, "Override operator (human-on-the-loop).");
        return { ok: true, message };
      }
      case "force_default": {
        if (targets.length === 0) return { ok: false, message: "Agent tidak ditemukan" };
        const gradual = targets.filter((a) => a.forceDefault().gradual).map((a) => a.name);
        const message =
          `Siklus default dipaksa pada ${scope}; agent dijeda sampai dilanjutkan.` +
          (gradual.length > 0
            ? ` ${gradual.join(", ")}: transisi bertahap maks. ${this.cfg.maxDeltaPerCycleSec} dtk per siklus (guardrail).`
            : "");
        log(`${operator}: ${message}`, "Override tetap lewat guardrail; tidak ada lompatan rencana yang melanggar batas.");
        return { ok: true, message };
      }
    }
  }

  /** Mulai skenario demo koridor dengan seed tetap. */
  runScenario(): { ok: boolean; message: string; corridor?: Corridor } {
    const graph = buildGraph(this.opts.intersections, this.cfg);
    const corridor = findCorridor(this.opts.intersections, graph);
    if (!corridor) return { ok: false, message: "Tidak ada tiga simpang bertetangga untuk koridor demo" };
    const s = CORRIDOR_SCENARIO;

    const forecasts: Record<string, number> = {};
    for (const n of this.opts.intersections) forecasts[n.id] = s.calmForecast;
    forecasts[corridor.center.id] = s.centerForecast;

    const base = this.opts;
    this.reset({
      forecasts,
      forecastSource: "skenario demo (prediksi tetap)",
      seed: s.seed,
      warmupSec: s.warmupSec,
      hotBearings: { [corridor.center.id]: hotBearingFor(corridor) },
      offsets: { [corridor.downstream.id]: s.downstreamOffsetSec },
    });
    // Opsi live disimpan supaya "kembali ke live" memakai prediksi database lagi.
    this.liveOptions = base;
    this.autoMode = true;
    this.scenario = {
      name: s.name,
      startedAtSec: 0,
      corridor: [corridor.upstream.id, corridor.center.id, corridor.downstream.id],
    };
    this.supervisor.corridorGoal = {
      name: `Koridor ${short(corridor.upstream.name)} – ${short(corridor.center.name)} – ${short(corridor.downstream.name)}`,
      nodeIds: this.scenario.corridor,
      objective: "Kurangi antrean di simpang tengah tanpa memindahkan macet ke hulu atau hilir",
    };
    this.agent(corridor.center.id)!.nextDecisionAtSec = s.decisionAtSec;
    this.record({
      type: "scenario",
      agentId: "supervisor",
      agentName: "Supervisor Ephor",
      summary: `Skenario demo dimulai: ${this.supervisor.corridorGoal.name} (seed ${s.seed}).`,
      reason: `Prediksi ${short(corridor.center.name)} ${s.centerForecast}%, simpang lain ${s.calmForecast}%. Supervisor hanya menetapkan tujuan koridor, tidak menyetujui keputusan.`,
    });
    return { ok: true, message: "Skenario dimulai", corridor };
  }

  private liveOptions: RuntimeOptions | null = null;

  /** Kembali ke mode live (prediksi dari database). */
  stopScenario(forecasts: Record<string, number>, source: string): void {
    const base = this.liveOptions ?? this.opts;
    this.liveOptions = null;
    this.reset({ ...base, forecasts, forecastSource: source, seed: undefined, hotBearings: undefined, offsets: undefined });
  }

  // ─── Injeksi gangguan (test & demo) ──────────────────────────────────────

  setSensorOnline(id: string, online: boolean): void {
    const sensor = this.agent(id)?.sensorRef as (Sensor & { online?: boolean }) | undefined;
    if (sensor && "online" in sensor) sensor.online = online;
  }

  setHeartbeat(id: string, enabled: boolean): void {
    const agent = this.agent(id);
    if (agent) agent.heartbeatEnabled = enabled;
  }

  snapshot(): RuntimeSnapshot {
    const agents = this.agents.map((a) => a.snapshot());
    return {
      runId: this.runId,
      simTimeSec: this.simTimeSec,
      speed: this.speed,
      autoMode: this.autoMode,
      scenario: this.scenario,
      persistence: this.persistence,
      agents,
      edges: this.graph.edges,
      supervisor: this.supervisor.summary(agents),
    };
  }
}
