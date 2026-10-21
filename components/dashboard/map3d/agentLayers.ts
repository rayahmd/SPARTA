// Layer peta untuk sistem multi-agent: garis tetangga antar simpang, cincin
// status agent di tiap pin, dan denyut emas yang merambat dari simpang asal
// ke tetangga sesuai urutan hop lalu memudar.

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { AgentEvent, RuntimeSnapshot } from "@/lib/agents/types";
import { AGENT_GOLD, AGENT_MAROON, AGENT_STATUS_COLORS, AGENT_STATUS_TEXT, agentStatusKey } from "../agentTheme";
import { MAP_LABEL_FONT } from "@/lib/config/map";

const LINKS = "agent-links";
const STATUS = "agent-status";
const PULSES = "agent-pulses";
const EMPTY = { type: "FeatureCollection" as const, features: [] };

/** Pasang source + layer agent sekali; aman dipanggil berulang. */
export function ensureAgentLayers(map: MapLibreMap, beforeId?: string): void {
  const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
  if (!map.getSource(LINKS)) map.addSource(LINKS, { type: "geojson", data: EMPTY });
  if (!map.getSource(STATUS)) map.addSource(STATUS, { type: "geojson", data: EMPTY });
  if (!map.getSource(PULSES)) map.addSource(PULSES, { type: "geojson", data: EMPTY });

  if (!map.getLayer(`${LINKS}-layer`)) {
    map.addLayer(
      {
        id: `${LINKS}-layer`,
        type: "line",
        source: LINKS,
        layout: { "line-cap": "round" },
        paint: {
          "line-color": ["case", ["get", "active"], AGENT_GOLD, AGENT_MAROON],
          "line-width": ["case", ["get", "active"], 3, 1.6],
          "line-opacity": ["case", ["get", "active"], 0.9, 0.45],
          "line-dasharray": [2, 2],
        },
      },
      before,
    );
  }
  if (!map.getLayer(`${STATUS}-ring`)) {
    map.addLayer(
      {
        id: `${STATUS}-ring`,
        type: "circle",
        source: STATUS,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 9, 14, 16, 17, 24],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.14,
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": ["case", ["==", ["get", "status"], "normal"], 2, 3.5],
          "circle-pitch-alignment": "map",
        },
      },
      before,
    );
  }
  if (!map.getLayer(`${PULSES}-layer`)) {
    map.addLayer(
      {
        id: `${PULSES}-layer`,
        type: "circle",
        source: PULSES,
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": AGENT_GOLD,
          "circle-opacity": ["*", 0.35, ["get", "opacity"]],
          "circle-stroke-color": AGENT_GOLD,
          "circle-stroke-width": 3,
          "circle-stroke-opacity": ["get", "opacity"],
          "circle-pitch-alignment": "map",
        },
      },
      before,
    );
  }
  if (!map.getLayer(`${STATUS}-label`)) {
    map.addLayer({
      id: `${STATUS}-label`,
      type: "symbol",
      source: STATUS,
      minzoom: 12,
      filter: ["!=", ["get", "status"], "normal"],
      layout: {
        "text-field": ["get", "label"],
        "text-font": MAP_LABEL_FONT,
        "text-size": 11,
        "text-anchor": "top",
        "text-offset": [0, 0.9],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": ["get", "color"],
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.6,
      },
    });
  }
}

export function setAgentLayersVisible(map: MapLibreMap, visible: boolean): void {
  for (const id of [`${LINKS}-layer`, `${STATUS}-ring`, `${STATUS}-label`, `${PULSES}-layer`]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  }
}

/** Garis tetangga yang dilalui notice dalam `windowSec` detik simulasi terakhir. */
export function recentNoticeLinks(events: AgentEvent[], simTimeSec: number, windowSec = 20): Set<string> {
  const links = new Set<string>();
  for (const e of events) {
    if (e.type === "notice_sent" && e.targetId && e.simTimeSec >= simTimeSec - windowSec) {
      links.add(linkKey(e.agentId, e.targetId));
    }
  }
  return links;
}

/** Perbarui garis tetangga dan cincin status dari snapshot runtime. */
export function setAgentData(map: MapLibreMap, snapshot: RuntimeSnapshot, activeLinks: Set<string>): void {
  const pos = new Map(snapshot.agents.map((a) => [a.id, [a.lng, a.lat] as [number, number]]));
  const links = snapshot.edges
    .filter((e) => pos.has(e.a) && pos.has(e.b))
    .map((e) => ({
      type: "Feature" as const,
      properties: { active: activeLinks.has(linkKey(e.a, e.b)), distance: e.distanceM },
      geometry: { type: "LineString" as const, coordinates: [pos.get(e.a)!, pos.get(e.b)!] },
    }));
  const status = snapshot.agents.map((a) => {
    const key = agentStatusKey(a);
    return {
      type: "Feature" as const,
      properties: { id: a.id, status: key, color: AGENT_STATUS_COLORS[key], label: AGENT_STATUS_TEXT[key] },
      geometry: { type: "Point" as const, coordinates: [a.lng, a.lat] },
    };
  });
  (map.getSource(LINKS) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: links });
  (map.getSource(STATUS) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: status });
}

export function linkKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface Pulse {
  kind: "ring" | "travel";
  from: [number, number];
  to: [number, number];
  startMs: number;
  durationMs: number;
}

const RING_MS = 1400;
const TRAVEL_MS = 1100;
/** Jeda per hop supaya urutan rambat tetap terlihat pada kecepatan 8x. */
const HOP_DELAY_MS = 650;

/**
 * Animasi denyut emas: cincin melebar di simpang asal, titik bergerak di
 * sepanjang garis tetangga, lalu cincin di simpang penerima.
 */
export class AgentPulseAnimator {
  private pulses: Pulse[] = [];
  private raf = 0;
  private lastSeq = -1;
  private reduceMotion: boolean;

  constructor(private readonly map: MapLibreMap) {
    this.reduceMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }

  /** Proses event baru; event lama (sebelum peta dibuka) tidak dianimasikan. */
  ingest(events: AgentEvent[], snapshot: RuntimeSnapshot | null): void {
    if (!snapshot) return;
    const pos = new Map(snapshot.agents.map((a) => [a.id, [a.lng, a.lat] as [number, number]]));
    const latest = events.at(-1)?.seq ?? 0;
    if (this.lastSeq < 0) {
      this.lastSeq = latest;
      return;
    }
    const now = performance.now();
    for (const e of events) {
      if (e.seq <= this.lastSeq) continue;
      const origin = pos.get(e.agentId);
      if (!origin) continue;
      if (e.type === "decision_applied" || e.type === "failsafe_enter" || e.type === "rollback") {
        this.pulses.push({ kind: "ring", from: origin, to: origin, startMs: now, durationMs: RING_MS });
      } else if (e.type === "notice_sent" && e.targetId) {
        const target = pos.get(e.targetId);
        if (!target) continue;
        const delay = ((e.hop ?? 1) - 1) * HOP_DELAY_MS;
        this.pulses.push({ kind: "travel", from: origin, to: target, startMs: now + delay, durationMs: TRAVEL_MS });
        this.pulses.push({ kind: "ring", from: target, to: target, startMs: now + delay + TRAVEL_MS, durationMs: RING_MS });
      }
    }
    this.lastSeq = latest;
    if (this.pulses.length > 0 && !this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    this.pulses = this.pulses.filter((p) => now < p.startMs + p.durationMs);
    const features = this.pulses
      .filter((p) => now >= p.startMs)
      .map((p) => {
        const t = Math.min(1, (now - p.startMs) / p.durationMs);
        const coords: [number, number] =
          p.kind === "travel" ? [p.from[0] + (p.to[0] - p.from[0]) * t, p.from[1] + (p.to[1] - p.from[1]) * t] : p.from;
        const radius = p.kind === "travel" ? 8 : this.reduceMotion ? 24 : 12 + 44 * t;
        const opacity = p.kind === "travel" ? 1 : 1 - t;
        return {
          type: "Feature" as const,
          properties: { radius, opacity },
          geometry: { type: "Point" as const, coordinates: coords },
        };
      });
    (this.map.getSource(PULSES) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
    if (this.pulses.length > 0) this.raf = requestAnimationFrame(this.frame);
  };

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pulses = [];
  }
}
