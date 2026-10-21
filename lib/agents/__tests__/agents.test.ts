import { describe, expect, test } from "bun:test";
import { InMemoryBus, topicMatches, topics } from "../bus";
import { AGENT_CONFIG, withConfig } from "../config";
import { buildGraph } from "../graph";
import { checkPlan } from "../guardrails";
import { DEFAULT_INTERSECTIONS, dedupeIntersections } from "../intersections";
import { buildIntersectionModel } from "../model";
import { cycleOf, shiftGreen, stepToward, withOffset, withPhases } from "../plan";
import { SimTwinGate } from "../twin-gate";
import type { ChangeNotice, SignalPlan } from "../types";
import { ID, eventsOf, liveRuntime, scriptedRuntime } from "./fixtures";

const cfg = AGENT_CONFIG;
const pemuda = DEFAULT_INTERSECTIONS.find((n) => n.id === ID.A)!;

function defaultPlan(): SignalPlan {
  return buildIntersectionModel(pemuda, 92).defaultPlan;
}

function withGreens(plan: SignalPlan, greens: number[]): SignalPlan {
  return withPhases(plan, plan.phases.map((p, i) => ({ ...p, greenSec: greens[i] })), "agent");
}

describe("graf tetangga", () => {
  test("haversine + radius + k terdekat, deterministik", () => {
    const graph = buildGraph(DEFAULT_INTERSECTIONS, cfg);
    const ids = (id: string) => graph.neighbors.get(id)!.map((l) => l.id).sort();
    expect(ids(ID.A)).toEqual([ID.B, ID.U].sort());
    expect(ids(ID.B)).toEqual([ID.A, ID.K, ID.U].sort());
    // Simpang tanpa tetangga dalam radius tetap terhubung ke simpang terdekatnya.
    expect(ids(ID.M)).toEqual([ID.K]);
    const edge = graph.edges.find((e) => [e.a, e.b].sort().join() === [ID.A, ID.B].sort().join())!;
    expect(edge.distanceM).toBeGreaterThan(380);
    expect(edge.distanceM).toBeLessThan(460);
    expect(edge.travelTimeSec).toBe(Math.round(edge.distanceM / cfg.platoonSpeedMps));
    expect(buildGraph(DEFAULT_INTERSECTIONS.slice().reverse(), cfg).edges).toEqual(graph.edges);
  });
});

describe("data simpang", () => {
  test("baris ganda di lokasi yang sama digabung jadi satu agent", () => {
    const doubled = DEFAULT_INTERSECTIONS.concat(DEFAULT_INTERSECTIONS.map((n) => ({ ...n, id: `${n.id}-x` })));
    const merged = dedupeIntersections(doubled);
    expect(merged.length).toBe(DEFAULT_INTERSECTIONS.length);
    expect(merged.find((n) => n.id === ID.A)!.aliasIds).toEqual([`${ID.A}-x`]);
  });
});

describe("bus pesan", () => {
  test("topik bergaya MQTT dan wildcard +", () => {
    expect(topics.notice("a")).toBe("sparta/agents/a/notice");
    expect(topicMatches("sparta/agents/+/heartbeat", "sparta/agents/x/heartbeat")).toBe(true);
    expect(topicMatches("sparta/agents/+/heartbeat", "sparta/agents/x/notice")).toBe(false);
  });

  test("pesan tiba setelah latensi, berurutan", () => {
    const bus = new InMemoryBus(1);
    const got: unknown[] = [];
    bus.subscribe("t/+", (p) => got.push(p));
    bus.publish("t/a", 1);
    bus.publish("t/b", 2);
    expect(bus.deliverDue(0)).toBe(0);
    expect(bus.deliverDue(1)).toBe(2);
    expect(got).toEqual([1, 2]);
  });
});

describe("guardrail", () => {
  const plan = defaultPlan();
  const greens = plan.phases.map((p) => p.greenSec);

  test("rencana default dan geser hijau ≤15 dtk lolos", () => {
    expect(checkPlan(plan, null, cfg)).toEqual({ ok: true });
    const shifted = shiftGreen(plan, plan.phases[3].approachId, 15, cfg, "agent");
    expect(shifted.applied).toBe(15);
    expect(shifted.plan.cycleSec).toBe(plan.cycleSec);
    expect(checkPlan(shifted.plan, plan, cfg)).toEqual({ ok: true });
  });

  test("menolak (tidak mengoreksi) rencana yang melanggar", () => {
    const cases: [string, SignalPlan, SignalPlan | null][] = [
      ["minimum", withGreens(plan, [8, greens[1], greens[2], greens[3]]), null],
      ["maksimum", withGreens(plan, [greens[0], 61, greens[2], greens[3]]), null],
      ["pejalan kaki", withGreens(plan, [11, greens[1], greens[2], greens[3]]), null],
      ["batas 15 dtk", withGreens(plan, [greens[0], greens[1], greens[2], greens[3] + 16]), plan],
      ["siklus", withGreens(plan, [60, 60, 60, 60]), null],
      ["offset", withOffset(plan, 20, "agent"), plan],
      [
        "kuning",
        withPhases(plan, plan.phases.map((p, i) => (i === 0 ? { ...p, yellowSec: 2 } : p)), "agent"),
        null,
      ],
      ["angka tidak valid", withGreens(plan, [Number.NaN, greens[1], greens[2], greens[3]]), null],
    ];
    for (const [label, bad, prev] of cases) {
      const result = checkPlan(bad, prev, cfg);
      expect(result.ok ? label : `${label}: ditolak`).toBe(`${label}: ditolak`);
      expect(result.ok ? 0 : result.violations.length).toBeGreaterThan(0);
    }
    const yellow = checkPlan(cases[6][1], null, cfg);
    expect(yellow.ok ? [] : yellow.violations.join()).toContain("Kuning");
  });

  test("transisi bertahap tidak pernah melompati batas per siklus", () => {
    const far = withGreens(plan, [greens[0] - 6, greens[1] - 6, greens[2] - 6, greens[3] + 18]);
    expect(checkPlan(far, plan, cfg).ok).toBe(false);
    let current = far;
    for (let i = 0; i < 5; i++) {
      const next = stepToward(current, plan, cfg.maxDeltaPerCycleSec, "failsafe");
      expect(checkPlan(next, current, cfg).ok).toBe(true);
      current = next;
    }
    expect(current.phases.map((p) => p.greenSec)).toEqual(greens);
    expect(cycleOf(current.phases)).toBe(plan.cycleSec);
  });
});

describe("twin gate", () => {
  const model = buildIntersectionModel(pemuda, 92, { hotBearingDeg: 298 });
  const twin = new SimTwinGate(cfg);
  const plan = model.defaultPlan;

  test("menolak rencana yang tidak membaik", () => {
    const same = twin.evaluate(model, plan, { ...plan, source: "agent" }, []);
    expect(same.improvementPct).toBe(0);
    expect(same.passed).toBe(false);

    // Mengambil hijau dari pendekat yang paling tertekan memperburuk antrean.
    const worse = shiftGreen(plan, model.hotApproachId, -10, cfg, "agent").plan;
    const verdict = twin.evaluate(model, plan, worse, []);
    expect(verdict.improvementPct).toBeLessThan(0);
    expect(verdict.passed).toBe(false);
  });

  test("meloloskan rencana yang membaik ≥ ambang, deterministik", () => {
    const better = shiftGreen(plan, model.hotApproachId, 15, cfg, "agent").plan;
    const a = twin.evaluate(model, plan, better, []);
    const b = new SimTwinGate(cfg).evaluate(model, plan, better, []);
    expect(a.passed).toBe(true);
    expect(a.improvementPct).toBeGreaterThanOrEqual(cfg.twinMinImprovementPct);
    expect(b).toEqual(a);
  });
});

describe("skenario demo koridor", () => {
  function runScenario(overrides = {}) {
    const runtime = liveRuntime({ cfg: withConfig(overrides) });
    runtime.runScenario();
    runtime.step(30);
    return runtime;
  }

  test("urutan selalu sama: A +15 dtk → B accept → U adjust → berhenti di maxHops", () => {
    const runtime = runScenario();
    const ev = eventsOf(runtime);
    const decision = ev.find((e) => e.type === "decision_applied")!;
    expect(decision.agentId).toBe(ID.A);
    expect(decision.summary).toContain("+15 dtk hijau");
    expect(decision.summary).toContain("Notice ke 2 simpang tetangga");
    expect(decision.twin!.improvementPct).toBeGreaterThanOrEqual(cfg.twinMinImprovementPct);

    const replies = ev.filter((e) => e.type === "reply_received" && e.agentId === ID.A);
    expect(replies.map((r) => [r.targetId, r.reply])).toEqual([
      [ID.B, "accept"],
      [ID.U, "adjust"],
    ]);
    expect(replies[0].summary).toContain("geser offset");
    expect(replies[1].summary).toContain("kurangi pelepasan");

    // Hop 2 (Kertajaya) menyesuaikan tetapi tidak meneruskan ke Merr.
    const hop2 = ev.find((e) => e.type === "neighbor_adjusted" && e.agentId === ID.K)!;
    expect(hop2.hop).toBe(2);
    expect(hop2.reason).toContain("Batas 2 hop tercapai");
    expect(ev.some((e) => e.targetId === ID.M || e.agentId === ID.M)).toBe(false);
    expect(Math.max(...ev.filter((e) => e.type === "notice_sent").map((e) => e.hop ?? 0))).toBe(2);
    expect(ev.some((e) => e.type === "rollback" || e.type === "failsafe_enter")).toBe(false);

    const again = eventsOf(runScenario()).map((e) => [e.simTimeSec, e.type, e.agentId, e.summary, e.reply]);
    expect(again).toEqual(ev.map((e) => [e.simTimeSec, e.type, e.agentId, e.summary, e.reply]));
  });

  test("propagasi berhenti di maxHops", () => {
    const runtime = runScenario({ maxHops: 1 });
    const ev = eventsOf(runtime);
    expect(ev.filter((e) => e.type === "notice_sent").every((e) => e.hop === 1)).toBe(true);
    const b = ev.find((e) => e.type === "neighbor_adjusted" && e.agentId === ID.B)!;
    expect(b.reason).toContain("Batas 1 hop tercapai");
    expect(ev.some((e) => e.agentId === ID.K)).toBe(false);
  });

  test("deduplikasi messageId mencegah loop di segitiga Tunjungan–Pemuda–Gubeng", () => {
    const runtime = runScenario();
    const ev = eventsOf(runtime);
    const messageId = ev.find((e) => e.type === "decision_applied")!.messageId!;
    const duplicates = ev.filter((e) => e.type === "notice_ignored" && e.reason?.includes("Duplikat"));
    expect(duplicates.map((e) => e.agentId).sort()).toEqual([ID.B, ID.U].sort());
    // Tiap simpang memproses gelombang yang sama paling banyak sekali.
    const adjusted = ev.filter((e) => e.type === "neighbor_adjusted" && e.messageId === messageId);
    expect(new Set(adjusted.map((e) => e.agentId)).size).toBe(adjusted.length);
    // Setelah gelombang selesai tidak ada notice baru yang beredar.
    const before = ev.filter((e) => e.type === "notice_sent").length;
    runtime.step(60);
    expect(eventsOf(runtime, "notice_sent").length).toBe(before);
  });
});

describe("cooldown", () => {
  test("simpang yang baru berubah menolak notice dan tidak memutuskan lagi", () => {
    const runtime = liveRuntime();
    runtime.runScenario();
    runtime.step(10);
    const a = runtime.agent(ID.A)!;
    expect(a.cooldownUntilSec).toBe(3 + cfg.cooldownCycles * a.plan.cycleSec);

    const notice: ChangeNotice = {
      messageId: "uji-cooldown-1",
      kind: "apply",
      originId: ID.B,
      originName: "Uji",
      fromId: ID.B,
      fromName: "Simpang Raya Gubeng (Stasiun Gubeng)",
      toId: ID.A,
      hop: 1,
      ttlSec: 120,
      sentAtSec: runtime.simTimeSec,
      change: { approachId: "W", approachLabel: "Barat", deltaGreenSec: 10, deltaOffsetSec: 0, flowBearingDeg: 270, summary: "uji" },
      platoon: { sizeVeh: 10, arrivalAtSec: runtime.simTimeSec + 50, travelTimeSec: 50 },
      senderPressure: 1.2,
    };
    runtime.bus.publish(topics.notice(ID.A), notice);
    runtime.step(3);
    const reply = eventsOf(runtime, "reply_received").find((e) => e.messageId === "uji-cooldown-1")!;
    expect(reply.agentId).toBe(ID.B);
    expect(reply.reply).toBe("reject");
    expect(reply.reason).toContain("Cooldown");

    runtime.step(a.cooldownUntilSec - runtime.simTimeSec - 1);
    const decisions = eventsOf(runtime).filter(
      (e) => e.agentId === ID.A && (e.type === "decision_applied" || e.type === "decision_rejected"),
    );
    expect(decisions.length).toBe(1);
  });
});

describe("rollback", () => {
  test("metrik memburuk > ambang → rencana lama kembali dan revert ke tetangga", () => {
    const { runtime, sensors } = scriptedRuntime();
    runtime.runScenario();
    // Setelah rencana A diganti, antrean live 30% di atas counterfactual.
    sensors.get(ID.A)!.worsenFactor = 1.3;
    runtime.step(3 + cfg.rollbackWindowSec + 5);

    const ev = eventsOf(runtime);
    const applied = ev.find((e) => e.type === "decision_applied" && e.agentId === ID.A)!;
    const rollback = ev.find((e) => e.type === "rollback" && e.agentId === ID.A)!;
    expect(rollback.simTimeSec).toBe(applied.simTimeSec + cfg.rollbackWindowSec);
    expect(rollback.reason).toContain("> 5%");
    const a = runtime.agent(ID.A)!;
    expect(a.plan.phases.map((p) => p.greenSec)).toEqual(a.model.defaultPlan.phases.map((p) => p.greenSec));
    expect(a.snapshot().activeChange).toBeNull();

    // Tetangga yang ikut berubah pada gelombang ini ikut dikembalikan.
    const reverted = ev.filter((e) => e.type === "rollback" && e.agentId !== ID.A).map((e) => e.agentId);
    expect(reverted).toContain(ID.B);
    expect(reverted).toContain(ID.U);
    const b = runtime.agent(ID.B)!;
    expect(b.plan.offsetSec).toBe(b.model.defaultPlan.offsetSec);
  });

  test("tanpa pemburukan tidak ada rollback", () => {
    const { runtime } = scriptedRuntime();
    runtime.runScenario();
    runtime.step(3 + cfg.rollbackWindowSec + 5);
    expect(eventsOf(runtime, "rollback")).toEqual([]);
  });
});

describe("fail-safe", () => {
  test("sensor hilang > heartbeatTimeoutSec → siklus default, lalu pulih otomatis", () => {
    const { runtime, sensors } = scriptedRuntime();
    runtime.runScenario();
    runtime.step(10);
    const a = runtime.agent(ID.A)!;
    expect(a.plan.phases.map((p) => p.greenSec)).not.toEqual(a.model.defaultPlan.phases.map((p) => p.greenSec));

    sensors.get(ID.A)!.online = false;
    runtime.step(cfg.heartbeatTimeoutSec);
    expect(a.status).not.toBe("failsafe");
    runtime.step(2);
    expect(a.status).toBe("failsafe");
    expect(a.plan.phases.map((p) => p.greenSec)).toEqual(a.model.defaultPlan.phases.map((p) => p.greenSec));
    const enter = eventsOf(runtime, "failsafe_enter")[0];
    expect(enter.agentId).toBe(ID.A);
    expect(enter.summary).toContain("Notice ke 2 simpang tetangga");

    // Selama fail-safe agent tidak memutuskan apa pun.
    runtime.step(30);
    expect(a.status).toBe("failsafe");

    sensors.get(ID.A)!.online = true;
    const recover = cfg.cooldownCycles * a.model.defaultPlan.cycleSec;
    runtime.step(recover - 1);
    expect(a.status).toBe("failsafe");
    runtime.step(2);
    expect(a.status).toBe("normal");
    expect(eventsOf(runtime, "failsafe_exit").map((e) => e.agentId)).toEqual([ID.A]);
  });

  test("heartbeat tetangga hilang dan metrik NaN memicu fail-safe", () => {
    const { runtime, sensors } = scriptedRuntime();
    runtime.setHeartbeat(ID.K, false);
    runtime.step(cfg.heartbeatTimeoutSec + 2);
    const entered = eventsOf(runtime, "failsafe_enter").map((e) => e.agentId).sort();
    // Tetangga Kertajaya (Gubeng dan Merr) masuk fail-safe; Kertajaya sendiri tidak.
    expect(entered).toEqual([ID.M, ID.B].sort());
    expect(eventsOf(runtime, "failsafe_enter")[0].reason).toContain("Heartbeat Simpang Kertajaya");

    runtime.setHeartbeat(ID.K, true);
    runtime.step(200);
    expect(runtime.agent(ID.B)!.status).toBe("normal");

    sensors.get(ID.U)!.nan = true;
    runtime.step(1);
    expect(runtime.agent(ID.U)!.status).toBe("failsafe");
    expect(eventsOf(runtime, "failsafe_enter").at(-1)!.reason).toContain("anomali");
  });
});

describe("override operator", () => {
  test("jeda dan paksa siklus default dicatat sebagai event dan lewat guardrail", () => {
    const runtime = liveRuntime();
    runtime.runScenario();
    runtime.step(10);
    const result = runtime.override({ action: "force_default", agentId: ID.A });
    expect(result.ok).toBe(true);
    const a = runtime.agent(ID.A)!;
    expect(a.paused).toBe(true);
    expect(a.plan.phases.map((p) => p.greenSec)).toEqual(a.model.defaultPlan.phases.map((p) => p.greenSec));
    expect(eventsOf(runtime, "override").at(-1)!.summary).toContain("Siklus default dipaksa");

    runtime.override({ action: "auto_mode", enabled: false });
    expect(runtime.autoMode).toBe(false);
    runtime.step(400);
    expect(eventsOf(runtime, "decision_applied").length).toBe(1);
  });
});
