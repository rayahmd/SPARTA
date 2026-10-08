import { describe, expect, test } from "bun:test";
import { SIM_DT, backlogSize, createSim, resetSim, stepSim } from "../engine";
import type { SimState } from "../engine";
import { buildLayout, poseAt } from "../layout";
import { readMetrics } from "../metrics";
import { fnv1a, mulberry32 } from "../rng";
import { colorForApproach, signalAt, sumCycleSec } from "../signal";
import { makeInput } from "./fixtures";

function run(state: SimState, seconds: number, onStep?: () => void): void {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) {
    stepSim(state, SIM_DT);
    onStep?.();
  }
}

function totalBacklog(state: SimState): number {
  let n = 0;
  for (let a = 0; a < state.backlog.length; a++) n += backlogSize(state, a);
  return n;
}

/** Celah terkecil antar kendaraan yang masih berbagi lintasan. */
function minSharedGap(state: SimState): number {
  let min = Infinity;
  for (const lanes of state.lanes) {
    for (const arr of lanes) {
      for (let i = 1; i < arr.length; i++) {
        const ahead = arr[i - 1];
        const behind = arr[i];
        const rear = ahead.s - ahead.params.lengthM;
        const shared = ahead.path === behind.path || rear < behind.path.stopS;
        if (shared) min = Math.min(min, rear - behind.s);
      }
    }
  }
  return min;
}

describe("rng", () => {
  test("mulberry32 deterministik dan berada di [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(fnv1a("ahmad-yani")).toBe(fnv1a("ahmad-yani"));
    expect(fnv1a("ahmad-yani")).not.toBe(fnv1a("ahmad-yanj"));
  });
});

describe("signal", () => {
  const plan = makeInput().plans.current;

  test("panjang siklus = jumlah semua fase", () => {
    expect(plan.cycleSec).toBe(sumCycleSec(plan.phases));
    expect(plan.cycleSec).toBe(40 + 25 + 40 + 25 + 4 * 5);
  });

  test("urutan hijau → kuning → all-red → fase berikutnya, lalu berulang", () => {
    expect(signalAt(plan, 0)).toMatchObject({ phaseIndex: 0, stage: "green" });
    expect(signalAt(plan, 39.9)).toMatchObject({ phaseIndex: 0, stage: "green" });
    expect(signalAt(plan, 40)).toMatchObject({ phaseIndex: 0, stage: "yellow" });
    expect(signalAt(plan, 43)).toMatchObject({ phaseIndex: 0, stage: "allRed" });
    expect(signalAt(plan, 45)).toMatchObject({ phaseIndex: 1, stage: "green" });
    expect(signalAt(plan, plan.cycleSec + 1)).toMatchObject({
      phaseIndex: 0,
      stage: "green",
    });
  });

  test("hanya pendekat pada fase aktif yang tidak merah", () => {
    const green = signalAt(plan, 10);
    expect(colorForApproach(plan, green, "N")).toBe("green");
    expect(colorForApproach(plan, green, "E")).toBe("red");
    expect(colorForApproach(plan, green, "S")).toBe("red");
    expect(colorForApproach(plan, signalAt(plan, 41), "N")).toBe("yellow");
    expect(colorForApproach(plan, signalAt(plan, 44), "N")).toBe("red");
  });
});

describe("layout", () => {
  const layout = buildLayout(makeInput().geometry);

  test("lajur kiri: kendaraan dari utara berjalan di sisi timur as jalan", () => {
    for (const lanePaths of layout.paths[0]) {
      for (const path of lanePaths) {
        if (path) expect(path.xs[0]).toBeGreaterThan(0);
      }
    }
  });

  test("belok kiri hanya dari lajur 0, belok kanan hanya dari lajur terakhir", () => {
    const north = layout.paths[0];
    expect(north[0][0]).not.toBeNull();
    expect(north[1][0]).toBeNull();
    expect(north[2][2]).not.toBeNull();
    expect(north[0][2]).toBeNull();
    expect(north[1][1]).not.toBeNull();
  });

  test("belok kiri dari utara keluar ke timur, belok kanan ke barat", () => {
    const left = layout.paths[0][0][0]!;
    const right = layout.paths[0][2][2]!;
    const pose = { x: 0, y: 0, heading: 0 };
    poseAt(left, left.length, pose);
    expect(pose.x).toBeGreaterThan(50);
    poseAt(right, right.length, pose);
    expect(pose.x).toBeLessThan(-50);
  });
});

describe("engine", () => {
  test("seed dan rencana sama menghasilkan metrik identik", () => {
    const a = createSim(makeInput(), "current");
    const b = createSim(makeInput(), "current");
    run(a, 400);
    run(b, 400);
    expect(readMetrics(a)).toEqual(readMetrics(b));
    expect(readMetrics(a).exited).toBeGreaterThan(0);
  });

  test("reset mengulang hasil yang sama persis", () => {
    const state = createSim(makeInput(), "current");
    run(state, 300);
    const first = readMetrics(state);
    resetSim(state);
    expect(readMetrics(state).spawned).toBe(0);
    run(state, 300);
    expect(readMetrics(state)).toEqual(first);
  });

  test("kedua rencana menerima kedatangan identik pada waktu yang sama", () => {
    const input = makeInput();
    const current = createSim(input, "current");
    const ai = createSim(input, "ai");
    for (let t = 0; t < 6; t++) {
      run(current, 100);
      run(ai, 100);
      expect(ai.spawned).toBe(current.spawned);
    }
    expect(current.spawned).toBeGreaterThan(100);
  });

  test("konservasi: kedatangan = aktif + keluar + backlog", () => {
    const state = createSim(makeInput({ demand: { N: 1800, S: 1500 } }), "current");
    run(state, 600, () => {
      expect(state.spawned).toBe(
        state.active + state.exited + totalBacklog(state),
      );
    });
    let counted = 0;
    for (const lanes of state.lanes) for (const arr of lanes) counted += arr.length;
    expect(counted).toBe(state.active);
  });

  test("tidak ada celah negatif selama 600 dtk pada kondisi jenuh", () => {
    // Setara X ≈ 1.05: permintaan di atas kapasitas di semua pendekat.
    const state = createSim(
      makeInput({ demand: { N: 1500, E: 650, S: 1500, W: 650 } }),
      "current",
    );
    let min = Infinity;
    run(state, 600, () => {
      min = Math.min(min, minSharedGap(state));
    });
    expect(min).toBeGreaterThanOrEqual(0);
    expect(totalBacklog(state)).toBeGreaterThan(0);
  });

  test("kendaraan tidak melewati garis henti saat merah dari keadaan berhenti", () => {
    // Pendekat timur merah selama fase utara (40 dtk pertama).
    const state = createSim(makeInput({ demand: { E: 900 } }), "current");
    run(state, 38);
    expect(state.crossedByApproach[1]).toBe(0);
    expect(state.queueNowByApproach[1]).toBeGreaterThan(0);
  });

  test("arus jenuh mobil saja berada di 1500–2400 kend/jam/lajur", () => {
    const state = createSim(
      makeInput({
        demand: { N: 3000, E: 0, S: 0, W: 0 },
        lanes: { N: 1, S: 1, E: 1, W: 1 },
        greens: { N: 60, E: 10, S: 10, W: 10 },
        aiGreens: null,
        mix: { motor: 0, mobil: 1, bus: 0, truk: 0 },
        throughOnly: true,
      }),
      "current",
    );
    const cycle = state.plan.cycleSec;
    // Siklus kedua: antrean sudah terbentuk. Ukur 10 dtk setelah hijau s.d. akhir hijau.
    run(state, cycle + 10);
    const before = state.crossedByApproach[0];
    run(state, 50);
    const flow = ((state.crossedByApproach[0] - before) / 50) * 3600;
    expect(flow).toBeGreaterThanOrEqual(1500);
    expect(flow).toBeLessThanOrEqual(2400);
  });

  test("createSim menolak rencana AI yang tidak ada", () => {
    expect(() => createSim(makeInput({ aiGreens: null }), "ai")).toThrow();
  });
});
