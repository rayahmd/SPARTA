import { describe, expect, test } from "bun:test";
import { buildSimInput, compassLabel } from "../adapter";
import { SIM_DT, backlogSize, createSim, stepSim } from "../engine";
import type { SimState } from "../engine";
import { detectJunction } from "../junction";
import type { RoadLine } from "../junction";
import { buildLayout, computeArmExits } from "../layout";
import type { DetectedArm, TrafficNodeSnapshot } from "../types";
import { makeInput } from "./fixtures";

const CENTER = { lat: -7.28, lng: 112.74 };
const M_LAT = 110_540;
const M_LNG = 111_320 * Math.cos((CENTER.lat * Math.PI) / 180);

/** Garis jalan dari titik-titik dalam meter (x timur, y utara) relatif ke CENTER. */
function road(roadClass: string, ...pts: [number, number][]): RoadLine {
  return {
    roadClass,
    coords: pts.map(([x, y]) => [CENTER.lng + x / M_LNG, CENTER.lat + y / M_LAT]),
  };
}

function bearings(roads: RoadLine[]): number[] | null {
  return (
    detectJunction(CENTER, roads)
      ?.arms.map((a) => Math.round(a.bearingDeg) % 360)
      .sort((a, b) => a - b) ?? null
  );
}

function run(state: SimState, seconds: number, onStep?: () => void): void {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) {
    stepSim(state, SIM_DT);
    onStep?.();
  }
}

describe("detectJunction", () => {
  test("perempatan: dua jalan bersilangan → 4 lengan", () => {
    expect(
      bearings([
        road("primary", [0, -300], [0, 300]),
        road("secondary", [-300, 0], [300, 0]),
      ]),
    ).toEqual([0, 90, 180, 270]);
  });

  test("pertigaan: jalan samping berakhir di jalan utama → 3 lengan", () => {
    expect(
      bearings([
        road("primary", [-300, 0], [300, 0]),
        road("secondary", [0, 0], [0, -300]),
      ]),
    ).toEqual([90, 180, 270]);
  });

  test("jalan dua jalur terpisah tetap terhitung satu lengan per arah", () => {
    const result = detectJunction(CENTER, [
      road("trunk", [-7, -300], [-7, 300]),
      road("trunk", [7, 300], [7, -300]),
      road("tertiary", [0, 0], [300, 0]),
    ]);
    expect(
      result?.arms.map((a) => Math.round(a.bearingDeg) % 360).sort((a, b) => a - b),
    ).toEqual([0, 90, 180]);
    expect(result?.arms.find((a) => Math.round(a.bearingDeg) === 180)?.carriageways).toBe(2);
  });

  test("simpang miring mempertahankan arah lengannya", () => {
    const b = bearings([
      road("primary", [-300, 0], [300, 0]),
      road("secondary", [0, 0], [212, 212]),
    ]);
    expect(b).toEqual([45, 90, 270]);
  });

  test("koordinat node yang meleset digeser ke simpang terdekat", () => {
    const result = detectJunction(CENTER, [
      road("primary", [60, -300], [60, 300]),
      road("secondary", [-300, 40], [300, 40]),
    ]);
    expect(result?.arms.length).toBe(4);
    expect(result?.offsetM).toBeGreaterThan(60);
    expect(result?.offsetM).toBeLessThan(80);
  });

  test("jalan sejajar yang tidak tersambung tidak dihitung sebagai lengan", () => {
    expect(
      bearings([
        road("primary", [-300, 0], [300, 0]),
        road("secondary", [0, 0], [0, -300]),
        road("primary", [-300, 45], [300, 45]),
      ]),
    ).toEqual([90, 180, 270]);
  });

  test("satu ruas jalan yang terpotong jadi dua garis tetap satu lengan", () => {
    expect(
      bearings([
        road("primary", [-300, 0], [300, 0]),
        road("secondary", [0, 0], [0, -30]),
        road("secondary", [0, -30], [0, -300]),
      ]),
    ).toEqual([90, 180, 270]);
  });

  test("ruas jalan lurus tanpa simpang → null (pakai bentuk default)", () => {
    expect(detectJunction(CENTER, [road("primary", [-300, 0], [300, 0])])).toBeNull();
    expect(detectJunction(CENTER, [])).toBeNull();
  });

  test("simpang yang semua lengannya jalan kecil ditolak", () => {
    expect(
      bearings([
        road("minor", [0, -300], [0, 300]),
        road("minor", [-300, 0], [300, 0]),
      ]),
    ).toBeNull();
  });
});

describe("layout simpang non-perempatan", () => {
  test("gerakan dari tiap lengan pertigaan", () => {
    // Jalan utama barat–timur dengan kaki di selatan.
    const exits = computeArmExits([90, 180, 270]);
    // Dari timur (melaju ke barat): lurus ke barat, kiri ke selatan.
    expect(exits[0].through?.arm).toBe(2);
    expect(exits[0].left?.arm).toBe(1);
    expect(exits[0].right).toBeUndefined();
    // Dari selatan (melaju ke utara): kiri ke barat, kanan ke timur, tanpa lurus.
    expect(exits[1].left?.arm).toBe(2);
    expect(exits[1].right?.arm).toBe(0);
    expect(exits[1].through).toBeUndefined();
    // Dari barat (melaju ke timur): lurus ke timur, kanan ke selatan.
    expect(exits[2].through?.arm).toBe(0);
    expect(exits[2].right?.arm).toBe(1);
    expect(exits[2].left).toBeUndefined();
  });

  test("percabangan Y: kedua cabang terjangkau dari batangnya", () => {
    const exits = computeArmExits([180, 325, 35]);
    const fromStem = exits[0];
    const targets = [fromStem.left?.arm, fromStem.through?.arm, fromStem.right?.arm]
      .filter((x) => x !== undefined)
      .sort();
    expect(targets).toEqual([1, 2]);
  });

  test("pertigaan: lintasan hanya dibuat untuk gerakan yang ada", () => {
    const layout = buildLayout(makeInput({ arms: ["E", "S", "W"] }).geometry);
    expect(layout.arms.map((a) => a.id)).toEqual(["E", "S", "W"]);
    const south = layout.paths[1];
    for (const lanePaths of south) expect(lanePaths[1]).toBeNull(); // tanpa lurus
    expect(south.some((lanePaths) => lanePaths[0])).toBe(true);
    expect(south.some((lanePaths) => lanePaths[2])).toBe(true);
    // Sisi utara jalan utama tidak punya lengan: trotoar menerus sampai pusat.
    expect(layout.arms[0].cornerIn + layout.arms[0].cornerOut).toBeGreaterThan(0);
    expect(Math.min(layout.arms[0].cornerIn, layout.arms[0].cornerOut)).toBe(0);
  });

  test("perempatan tegak lurus: garis henti di tepi jalan yang melintang", () => {
    const layout = buildLayout(makeInput().geometry);
    // Lengan utara berhenti di tepi jalan timur–barat (2 lajur × 3,2 m) + 4 m.
    expect(layout.arms[0].stopDist).toBeCloseTo(2 * 3.2 + 4, 6);
    expect(layout.arms[1].stopDist).toBeCloseTo(3 * 3.2 + 4, 6);
  });
});

describe("engine pada pertigaan", () => {
  const input = makeInput({
    arms: ["E", "S", "W"],
    demand: { E: 900, S: 500, W: 900 },
    greens: { N: 0, E: 35, S: 25, W: 35 },
    aiGreens: null,
  });

  test("tidak ada kendaraan yang mengambil gerakan yang tidak ada", () => {
    const state = createSim(input, "current");
    let checked = 0;
    run(state, 400, () => {
      for (const lanes of state.lanes) {
        for (const arr of lanes) {
          for (const veh of arr) {
            expect(state.layout.arms[veh.approach].exits[veh.movement]).toBeDefined();
            checked++;
          }
        }
      }
    });
    expect(checked).toBeGreaterThan(0);
    expect(state.exited).toBeGreaterThan(0);
  });

  test("konservasi kendaraan dan celah tidak negatif", () => {
    const state = createSim(input, "current");
    let minGap = Infinity;
    run(state, 500, () => {
      let backlog = 0;
      for (let a = 0; a < state.backlog.length; a++) backlog += backlogSize(state, a);
      expect(state.spawned).toBe(state.active + state.exited + backlog);
      for (const lanes of state.lanes) {
        for (const arr of lanes) {
          for (let i = 1; i < arr.length; i++) {
            const ahead = arr[i - 1];
            const rear = ahead.s - ahead.params.lengthM;
            if (ahead.path === arr[i].path || rear < arr[i].path.stopS) {
              minGap = Math.min(minGap, rear - arr[i].s);
            }
          }
        }
      }
    });
    expect(minGap).toBeGreaterThanOrEqual(0);
  });

  test("semua lengan mengeluarkan kendaraan dalam satu jam", () => {
    const state = createSim(input, "current");
    run(state, 900);
    for (let a = 0; a < state.layout.arms.length; a++) {
      expect(state.crossedByApproach[a]).toBeGreaterThan(0);
    }
  });
});

describe("buildSimInput dengan bentuk simpang terdeteksi", () => {
  const OPTS = { source: "snapshot", generatedAt: "2026-01-01T00:00:00.000Z" } as const;
  const node: TrafficNodeSnapshot = {
    id: "pemuda",
    name: "Simpang Pemuda",
    lat: -7.2657,
    lng: 112.7478,
    currentLevel: 80,
    predicted30: 95,
    confidence: 0.9,
    recommendation: "+15 detik Durasi Hijau",
  };
  const tJunction: DetectedArm[] = [
    { bearingDeg: 11, roadClass: "tertiary", carriageways: 2 },
    { bearingDeg: 108, roadClass: "secondary", carriageways: 1 },
    { bearingDeg: 285, roadClass: "secondary", carriageways: 1 },
  ];

  test("pertigaan: 3 pendekat, 3 fase, rasio belok hanya untuk gerakan yang ada", () => {
    const input = buildSimInput(node, { ...OPTS, arms: tJunction });
    expect(input.meta.junction).toEqual({ source: "osm", armCount: 3 });
    expect(input.geometry.approaches.map((a) => a.label)).toEqual([
      "Utara",
      "Timur",
      "Barat",
    ]);
    expect(input.plans.current.phases.length).toBe(3);
    expect(input.plans.ai?.phases.length).toBe(3);
    expect(input.meta.mocked).toContain("Jumlah lajur");
    expect(input.meta.mocked).not.toContain("Bentuk dan geometri simpang");

    const exits = computeArmExits(input.geometry.approaches.map((a) => a.bearingDeg));
    input.geometry.approaches.forEach((approach, i) => {
      const { left, through, right } = approach.turnRatio;
      expect(left + through + right).toBeCloseTo(1, 6);
      if (!exits[i].left) expect(left).toBe(0);
      if (!exits[i].through) expect(through).toBe(0);
      if (!exits[i].right) expect(right).toBe(0);
    });
  });

  test("input pertigaan berjalan di engine untuk kedua rencana", () => {
    const input = buildSimInput(node, { ...OPTS, arms: tJunction });
    const current = createSim(input, "current");
    const ai = createSim(input, "ai");
    run(current, 600);
    run(ai, 600);
    expect(ai.spawned).toBe(current.spawned);
    expect(current.exited).toBeGreaterThan(0);
    expect(ai.exited).toBeGreaterThan(0);
  });

  test("deteksi yang tidak layak (1 lengan / >5 lengan) kembali ke perempatan default", () => {
    const one = buildSimInput(node, { ...OPTS, arms: [tJunction[0]] });
    expect(one.meta.junction).toEqual({ source: "default", armCount: 4 });
    const many = buildSimInput(node, {
      ...OPTS,
      arms: [0, 60, 120, 180, 240, 300].map((bearingDeg) => ({
        bearingDeg,
        roadClass: "primary",
        carriageways: 1,
      })),
    });
    expect(many.meta.junction.source).toBe("default");
  });

  test("nama arah mata angin", () => {
    expect(compassLabel(0)).toBe("Utara");
    expect(compassLabel(50)).toBe("Timur Laut");
    expect(compassLabel(180)).toBe("Selatan");
    expect(compassLabel(285)).toBe("Barat");
    expect(compassLabel(300)).toBe("Barat Laut");
    expect(compassLabel(350)).toBe("Utara");
  });
});
