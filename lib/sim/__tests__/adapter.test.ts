import { describe, expect, test } from "bun:test";
import { MAX_GREEN_SEC, MIN_GREEN_SEC, buildSimInput } from "../adapter";
import { SIM_DT, createSim, stepSim } from "../engine";
import { parseRecommendation } from "../recommendation";
import { sumCycleSec } from "../signal";
import type { IntersectionSimInput, TrafficNodeSnapshot } from "../types";

const OPTS = { source: "snapshot", generatedAt: "2026-01-01T00:00:00.000Z" } as const;

function indexOfApproach(input: IntersectionSimInput, id: string): number {
  return input.geometry.approaches.findIndex((a) => a.id === id);
}

function snapshot(over: Partial<TrafficNodeSnapshot> = {}): TrafficNodeSnapshot {
  return {
    id: "ahmad-yani",
    name: "Persimpangan Ahmad Yani",
    lat: -7.3172,
    lng: 112.7345,
    currentLevel: 71,
    predicted30: 92,
    confidence: 0.91,
    recommendation: "+15 detik Durasi Hijau",
    ...over,
  };
}

describe("parseRecommendation", () => {
  test("semua teks rekomendasi yang ada di repo", () => {
    expect(parseRecommendation("+15 detik Durasi Hijau")).toEqual({
      kind: "green-delta",
      deltaSec: 15,
      raw: "+15 detik Durasi Hijau",
    });
    expect(parseRecommendation("+10 detik Durasi Hijau")).toMatchObject({
      kind: "green-delta",
      deltaSec: 10,
    });
    expect(parseRecommendation("-10 detik Durasi Hijau")).toMatchObject({
      kind: "green-delta",
      deltaSec: -10,
    });
    expect(parseRecommendation("Tambah durasi hijau +10 detik")).toMatchObject({
      kind: "green-delta",
      deltaSec: 10,
    });
    expect(parseRecommendation("+5 dtk Fase Hijau")).toMatchObject({
      kind: "green-delta",
      deltaSec: 5,
    });
    expect(parseRecommendation("Aktifkan siklus sinyal adaptif")).toMatchObject({
      kind: "adaptive",
    });
  });

  test("kosong → none, teks lain → unparsed", () => {
    expect(parseRecommendation(null)).toEqual({ kind: "none", raw: null });
    expect(parseRecommendation("   ")).toEqual({ kind: "none", raw: null });
    expect(parseRecommendation("Alihkan arus ke Jl. Darmo")).toEqual({
      kind: "unparsed",
      raw: "Alihkan arus ke Jl. Darmo",
    });
  });
});

describe("buildSimInput", () => {
  test("deterministik untuk snapshot yang sama", () => {
    expect(buildSimInput(snapshot(), OPTS)).toEqual(buildSimInput(snapshot(), OPTS));
  });

  test("rencana eksisting: 4 fase per pendekat, siklus = jumlah fase", () => {
    const input = buildSimInput(snapshot(), OPTS);
    const { current } = input.plans;
    expect(current.phases.map((p) => p.approaches)).toEqual([
      ["N"],
      ["E"],
      ["S"],
      ["W"],
    ]);
    expect(input.meta.junction).toEqual({ source: "default", armCount: 4 });
    expect(current.cycleSec).toBe(sumCycleSec(current.phases));
    for (const phase of current.phases) {
      expect(phase.greenSec).toBeGreaterThanOrEqual(22);
      expect(phase.greenSec).toBeLessThanOrEqual(45);
      expect(phase.yellowSec).toBe(3);
      expect(phase.allRedSec).toBe(2);
    }
    expect(input.geometry.driveSide).toBe("left");
    expect(input.meta.mocked.length).toBeGreaterThan(0);
  });

  test("green-delta hanya mengubah fase pendekat kritis dan siklus ikut berubah", () => {
    const input = buildSimInput(snapshot(), OPTS);
    const { current, ai } = input.plans;
    expect(ai).not.toBeNull();
    const critical = indexOfApproach(input, input.criticalApproach);
    current.phases.forEach((phase, i) => {
      const expected = i === critical ? phase.greenSec + 15 : phase.greenSec;
      expect(ai!.phases[i].greenSec).toBe(expected);
    });
    expect(ai!.cycleSec).toBe(current.cycleSec + 15);
    expect(ai!.cycleSec).toBe(sumCycleSec(ai!.phases));
  });

  test("green-delta dijepit ke [10, 90] detik", () => {
    const up = buildSimInput(snapshot({ recommendation: "+200 detik" }), OPTS);
    const down = buildSimInput(snapshot({ recommendation: "-99 detik" }), OPTS);
    const iUp = indexOfApproach(up, up.criticalApproach);
    const iDown = indexOfApproach(down, down.criticalApproach);
    expect(up.plans.ai!.phases[iUp].greenSec).toBe(MAX_GREEN_SEC);
    expect(down.plans.ai!.phases[iDown].greenSec).toBe(MIN_GREEN_SEC);
  });

  test("adaptive mempertahankan panjang siklus dan hijau minimum", () => {
    const input = buildSimInput(
      snapshot({ recommendation: "Aktifkan siklus sinyal adaptif" }),
      OPTS,
    );
    const { current, ai } = input.plans;
    expect(ai).not.toBeNull();
    expect(ai!.cycleSec).toBe(current.cycleSec);
    for (const phase of ai!.phases) {
      expect(phase.greenSec).toBeGreaterThanOrEqual(MIN_GREEN_SEC);
    }
  });

  test("tanpa rekomendasi atau teks tak terbaca → tidak ada rencana AI", () => {
    expect(buildSimInput(snapshot({ recommendation: null }), OPTS).plans.ai).toBeNull();
    const unparsed = buildSimInput(snapshot({ recommendation: "Pantau saja" }), OPTS);
    expect(unparsed.plans.ai).toBeNull();
    expect(unparsed.recommendation.kind).toBe("unparsed");
  });

  test("volume naik mengikuti tingkat kemacetan", () => {
    const total = (level: number) =>
      buildSimInput(snapshot({ currentLevel: level }), OPTS).geometry.approaches.reduce(
        (sum, a) => sum + a.demandVph,
        0,
      );
    expect(total(20)).toBeLessThan(total(60));
    expect(total(60)).toBeLessThan(total(95));
  });

  test("confidence 0..100 dinormalkan ke 0..1; rasio dan komposisi berjumlah 1", () => {
    const input = buildSimInput(snapshot({ confidence: 95 }), OPTS);
    expect(input.node.confidence).toBeCloseTo(0.95, 6);
    for (const approach of input.geometry.approaches) {
      const { left, through, right } = approach.turnRatio;
      expect(left + through + right).toBeCloseTo(1, 6);
    }
    const mix = input.vehicleMix;
    expect(mix.motor + mix.mobil + mix.bus + mix.truk).toBeCloseTo(1, 6);
  });

  test("input hasil adapter bisa dijalankan engine untuk kedua rencana", () => {
    const input = buildSimInput(snapshot({ currentLevel: 100 }), OPTS);
    const current = createSim(input, "current");
    const ai = createSim(input, "ai");
    for (let i = 0; i < Math.round(600 / SIM_DT); i++) {
      stepSim(current, SIM_DT);
      stepSim(ai, SIM_DT);
    }
    expect(ai.spawned).toBe(current.spawned);
    expect(current.exited).toBeGreaterThan(0);
    expect(ai.exited).toBeGreaterThan(0);
  });
});
