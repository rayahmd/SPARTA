// Model digital twin satu simpang untuk agent: geometri, rencana default,
// rasio belok, dan seed diambil dari adapter lib/sim (buildSimInput), lalu
// volume per pendekat disusun ulang dari prediksi kepadatan Supervisor.
// Semua deterministik: seed diturunkan dari `simKey` (nama simpang), bukan id
// database, supaya skenario demo sama di setiap instalasi.

import { SAT_FLOW_VPH_PER_LANE, buildSimInput } from "@/lib/sim/adapter";
import { deriveSeed, mulberry32 } from "@/lib/sim/rng";
import type { IntersectionSimInput } from "@/lib/sim/types";
import { angleDiff } from "./graph";
import { planFromSimInput } from "./plan";
import type { IntersectionInfo, SignalPlan } from "./types";

export interface ApproachModel {
  id: string;
  label: string;
  bearingDeg: number;
  lanes: number;
  through: number;
  /** Permintaan ÷ kapasitas pada rencana default. */
  load: number;
  demandVph: number;
}

export interface IntersectionModel {
  info: IntersectionInfo;
  simKey: string;
  forecast: number;
  /** Input lib/sim dengan rencana default sebagai `plans.current`. */
  input: IntersectionSimInput;
  defaultPlan: SignalPlan;
  approaches: ApproachModel[];
  hotApproachId: string;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface BuildModelOptions {
  /** Pendekat yang paling tertekan; default = pendekat kritis adapter. */
  hotBearingDeg?: number;
  /** Seed skenario; dicampur dengan simKey supaya tiap simpang punya aliran acak sendiri. */
  seed?: number;
}

export function buildIntersectionModel(
  info: IntersectionInfo,
  forecast: number,
  opts: BuildModelOptions = {},
): IntersectionModel {
  const simKey = slugify(info.name) || info.id;
  const level = Math.max(0, Math.min(100, forecast));
  const base = buildSimInput(
    {
      id: simKey,
      name: info.name,
      lat: info.lat,
      lng: info.lng,
      currentLevel: level,
      predicted30: level,
      confidence: 0.9,
      recommendation: null,
    },
    { source: "snapshot", generatedAt: "2026-01-01T00:00:00.000Z" },
  );

  const approachesIn = base.geometry.approaches;
  const hot =
    opts.hotBearingDeg === undefined
      ? base.criticalApproach
      : approachesIn.reduce((best, a) =>
          angleDiff(a.bearingDeg, opts.hotBearingDeg!) < angleDiff(best.bearingDeg, opts.hotBearingDeg!) ? a : best,
        ).id;

  // Beban (permintaan ÷ kapasitas default): pendekat kritis naik bersama
  // prediksi hingga lewat jenuh, pendekat lain sedang. Variasi kecil per
  // pendekat dari seed. Data demo, dicatat di meta.mocked oleh adapter.
  const seed = opts.seed === undefined ? base.seed : deriveSeed(opts.seed, simKey);
  const rng = mulberry32(deriveSeed(seed, "agent-load"));
  const current = base.plans.current;
  const approaches: ApproachModel[] = approachesIn.map((a) => {
    const phase = current.phases.find((p) => p.approaches.includes(a.id));
    const green = phase?.greenSec ?? 0;
    const capacity = (SAT_FLOW_VPH_PER_LANE * a.lanes * green) / current.cycleSec;
    const jitter = 0.95 + rng() * 0.1;
    const load = a.id === hot ? 0.7 + (0.6 * level) / 100 : (0.45 + (0.25 * level) / 100) * jitter;
    return {
      id: a.id,
      label: a.label,
      bearingDeg: a.bearingDeg,
      lanes: a.lanes,
      through: a.turnRatio.through,
      load,
      demandVph: Math.round(load * capacity),
    };
  });

  const input: IntersectionSimInput = {
    ...base,
    geometry: {
      ...base.geometry,
      approaches: approachesIn.map((a, i) => ({ ...a, demandVph: approaches[i].demandVph })),
    },
    plans: { current, ai: null },
    criticalApproach: hot,
    seed,
  };

  return {
    info,
    simKey,
    forecast: level,
    input,
    defaultPlan: planFromSimInput(input),
    approaches,
    hotApproachId: hot,
  };
}

export function approachById(model: IntersectionModel, id: string): ApproachModel | undefined {
  return model.approaches.find((a) => a.id === id);
}

/** Lengan simpang yang arahnya paling dekat dengan `bearingDeg`. */
export function nearestApproach(model: IntersectionModel, bearingDeg: number): ApproachModel {
  return model.approaches.reduce((best, a) =>
    angleDiff(a.bearingDeg, bearingDeg) < angleDiff(best.bearingDeg, bearingDeg) ? a : best,
  );
}

/** Kendaraan yang bisa dilepas pendekat dalam satu hijau `greenSec`. */
export function dischargePerGreen(a: ApproachModel, greenSec: number): number {
  return (SAT_FLOW_VPH_PER_LANE * a.lanes * greenSec) / 3600;
}

/** Tekanan pendekat (permintaan ÷ kapasitas) pada rencana `plan`. */
export function pressureOf(model: IntersectionModel, plan: SignalPlan, approachId: string): number {
  const a = approachById(model, approachId);
  const phase = plan.phases.find((p) => p.approachId === approachId);
  const def = model.defaultPlan.phases.find((p) => p.approachId === approachId);
  if (!a || !phase || !def || phase.greenSec <= 0) return 0;
  // Kapasitas sebanding porsi hijau dalam siklus.
  const share = phase.greenSec / plan.cycleSec;
  const defShare = def.greenSec / model.defaultPlan.cycleSec;
  return (a.load * defShare) / share;
}
