// Singleton runtime multi-agent di server Next.js. Disimpan di globalThis
// supaya hot reload (HMR) dan beberapa route handler memakai instance yang
// sama. Jam simulasi maju saat ada permintaan (GET snapshot, stream SSE),
// jadi tidak ada timer yang hidup terus tanpa penonton.

import prisma from "@/lib/db";
import { typicalLevel } from "@/lib/simulation/trafficModel";
import { DEFAULT_INTERSECTIONS, dedupeIntersections } from "./intersections";
import { AgentRuntime } from "./runtime";
import { AgentEventStore } from "./store";
import type { IntersectionInfo } from "./types";

const FORECAST_REFRESH_MS = 15000;

interface AgentServerState {
  runtime: Promise<AgentRuntime>;
  lastForecastMs: number;
}

declare global {
  var spartaAgents: AgentServerState | undefined;
}

interface LoadedNodes {
  intersections: IntersectionInfo[];
  forecasts: Record<string, number>;
  source: string;
}

/** Simpang dan prediksi (TrafficNode.predicted30) dari database; cadangan bila gagal. */
async function loadNodes(): Promise<LoadedNodes> {
  try {
    const rows = await prisma.trafficNode.findMany({
      select: { id: true, name: true, lat: true, lng: true, predicted30: true },
    });
    if (rows.length > 0) {
      return {
        intersections: dedupeIntersections(rows.map(({ id, name, lat, lng }) => ({ id, name, lat, lng }))),
        forecasts: Object.fromEntries(rows.map((r) => [r.id, r.predicted30])),
        source: "model prediksi (TrafficNode.predicted30)",
      };
    }
  } catch (error) {
    console.error("[agents] Gagal membaca simpang dari database, memakai daftar cadangan:", error);
  }
  const now = new Date();
  const level = typicalLevel(now.getHours() + now.getMinutes() / 60);
  return {
    intersections: DEFAULT_INTERSECTIONS,
    forecasts: Object.fromEntries(DEFAULT_INTERSECTIONS.map((n) => [n.id, level])),
    source: "pola harian (database tidak tersedia)",
  };
}

async function createRuntime(): Promise<AgentRuntime> {
  const { intersections, forecasts, source } = await loadNodes();
  const runtime = new AgentRuntime({ intersections, forecasts, forecastSource: source });
  const store = new AgentEventStore((available) => {
    runtime.persistence = available ? "db" : "memory";
  });
  runtime.persistence = "db";
  runtime.onEvent = (event) => store.add(event);
  return runtime;
}

export function getAgentRuntime(): Promise<AgentRuntime> {
  if (!globalThis.spartaAgents) {
    const state: AgentServerState = { runtime: createRuntime(), lastForecastMs: Date.now() };
    // Instance gagal dibuat: coba lagi di permintaan berikutnya.
    state.runtime.catch(() => {
      if (globalThis.spartaAgents === state) globalThis.spartaAgents = undefined;
    });
    globalThis.spartaAgents = state;
  }
  return globalThis.spartaAgents.runtime;
}

/** Majukan jam dan, paling sering tiap 15 dtk, perbarui prediksi dari database. */
export async function tickAgentRuntime(runtime: AgentRuntime): Promise<void> {
  runtime.advanceRealtime(Date.now());
  const state = globalThis.spartaAgents;
  if (!state || runtime.scenario || Date.now() - state.lastForecastMs < FORECAST_REFRESH_MS) return;
  state.lastForecastMs = Date.now();
  try {
    const rows = await prisma.trafficNode.findMany({ select: { id: true, predicted30: true } });
    runtime.updateForecasts(
      Object.fromEntries(rows.map((r) => [r.id, r.predicted30])),
      "model prediksi (TrafficNode.predicted30)",
    );
  } catch {
    // Prediksi lama tetap dipakai.
  }
}

/** Prediksi live untuk kembali dari mode skenario. */
export async function liveForecasts(): Promise<{ forecasts: Record<string, number>; source: string }> {
  const { forecasts, source } = await loadNodes();
  return { forecasts, source };
}
