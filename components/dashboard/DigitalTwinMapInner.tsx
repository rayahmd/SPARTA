"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { renderToString } from "react-dom/server";
import {
  Map as MapLibreMap,
  Marker,
  Popup,
  NavigationControl,
  type GeoJSONSource,
  type PaddingOptions,
  type MapMouseEvent,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  AlertTriangle,
  CalendarDays,
  Ambulance as AmbulanceIcon,
  TrendingUp,
  TrendingDown,
  MoveRight,
  Video,
} from "lucide-react";
import { OSRMRoutingService } from "@/lib/services/osrm-routing";
import dynamic from "next/dynamic";
import { SHOW_PREDICTION_UI } from "@/lib/config/features";
import { MAP_LABEL_FONT, MAP_STYLE_URL } from "@/lib/config/map";
import { NodePopupCard } from "./NodePopupCard";
import { VehiclePopupCard } from "./VehiclePopupCard";
import { detectJunctionFromMap } from "@/components/sim/junctionFromMap";
import type { DetectedArm } from "@/lib/sim/types";
import { MapModelLayer } from "./map3d/MapModelLayer";

// ─── Types ─────────────────────────────────────────────────────────────────
interface TrafficNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
  currentLevel: number;
  predicted30: number;
  confidence: number;
  recommendation: string | null;
  updatedAt?: string;
}
interface EmergencyVehicle {
  id: string;
  label: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  progress: number;
  etaMinutes: number;
  distanceKm: number;
  greenWaveOn: boolean;
  status: string;
}
interface MapInnerProps {
  nodes: TrafficNode[];
  vehicles: EmergencyVehicle[];
  activeTab: "live" | "prediction" | "simulation";
  onNodeSelect: (node: TrafficNode) => void;
  onApprove?: (id: string, action: string) => void;
  initialOverlays?: Partial<OverlayState>;
  /** Konten halaman di pojok kiri atas peta, di atas kontrol overlay (mis. pill judul). */
  topLeftSlot?: ReactNode;
  /** Area peta yang tertutup panel halaman; pin yang diklik digeser ke luar area ini. */
  focusPadding?: Partial<PaddingOptions>;
  /** Geser peta ke kendaraan ini. Ganti `seq` untuk memicu ulang pada id yang sama. */
  focusVehicle?: { id: string; seq: number } | null;
}
interface OverlayState {
  cctv: boolean;
  lights: boolean;
  vehicles: boolean;
  crowd: boolean;
  events: boolean;
}

// ─── Forecast configuration ────────────────────────────────────────────────
const FORECAST_CONF: Record<
  number,
  { mult: number; confidence: number; label: string }
> = {
  0: { mult: 1.0, confidence: 99, label: "Sekarang" },
  15: { mult: 1.12, confidence: 93, label: "+15 Menit" },
  30: { mult: 1.25, confidence: 87, label: "+30 Menit" },
  60: { mult: 1.45, confidence: 72, label: "+60 Menit" },
};

// ─── Simulation scenarios ──────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: "existing",
    label: "Kondisi Eksisting",
    congestion: 0,
    travel: 0,
    queue: 0,
  },
  {
    id: "+5s",
    label: "+5 dtk Fase Hijau",
    congestion: -8,
    travel: -15,
    queue: -20,
  },
  {
    id: "+10s",
    label: "+10 dtk Fase Hijau",
    congestion: -15,
    travel: -28,
    queue: -35,
  },
  {
    id: "+15s",
    label: "+15 dtk Fase Hijau",
    congestion: -21,
    travel: -38,
    queue: -48,
  },
  {
    id: "diversion",
    label: "Alih Arus Sementara",
    congestion: -32,
    travel: -55,
    queue: -65,
  },
];

// ─── Configure MapLibre GL worker (required for v6 in Next.js/webpack) ───────
setWorkerUrl("https://unpkg.com/maplibre-gl@6.1.0/dist/maplibre-gl-worker.mjs");

// ─── Initialize OSRM routing service ────────────────────────────────────────
const osrm = new OSRMRoutingService();

// ─── Panel simulasi 3D simpang (lazy, client-only) ──────────────────────────
const IntersectionSimPanel = dynamic(
  () => import("@/components/sim/IntersectionSimPanel"),
  { ssr: false },
);

// ─── Road segment type ──────────────────────────────────────────────────────
interface RoadSegment {
  id: string;
  fromNode: TrafficNode;
  toNode: TrafficNode;
  geometry: [number, number][];
  avgLevel: number;
}

// ─── Vehicle route type ─────────────────────────────────────────────────────
interface VehicleRoute {
  vehicleId: string;
  geometry: [number, number][];
  distance: number;
  duration: number;
}

// ─── Jaringan ruas kepadatan ───────────────────────────────────────────────
// Tiap persimpangan dihubungkan ke beberapa persimpangan terdekatnya, jadi
// ruas kepadatan otomatis mencakup semua node yang ada di data.
const ROAD_NEIGHBORS = 2;
function buildRoadConnections(nodes: TrafficNode[]): [TrafficNode, TrafficNode][] {
  // Node dengan posisi yang sama dihitung sekali.
  const unique = Array.from(
    new Map(nodes.map((n) => [`${n.lat},${n.lng}`, n])).values(),
  );
  const pairs = new Map<string, [TrafficNode, TrafficNode]>();
  unique.forEach((from, i) => {
    unique
      .map((to, j) => ({
        to,
        j,
        distance: Math.hypot(to.lat - from.lat, to.lng - from.lng),
      }))
      .filter((c) => c.j !== i)
      .sort((x, y) => x.distance - y.distance)
      .slice(0, ROAD_NEIGHBORS)
      .forEach(({ to, j }) => {
        pairs.set(i < j ? `${i}-${j}` : `${j}-${i}`, i < j ? [from, to] : [to, from]);
      });
  });
  return Array.from(pairs.values());
}

// Geometri rute antar persimpangan. Server OSRM publik membatasi laju
// permintaan, jadi permintaan diantrekan dan hasilnya di-cache per pasangan
// titik (polling data tiap 5 detik tidak memicu permintaan ulang).
const ROUTE_CONCURRENCY = 3;
let routeSlots = ROUTE_CONCURRENCY;
const routeQueue: (() => void)[] = [];
const segmentRoutes = new Map<string, Promise<[number, number][] | null>>();
function fetchSegmentRoute(
  from: TrafficNode,
  to: TrafficNode,
): Promise<[number, number][] | null> {
  const key = `${from.lat},${from.lng}|${to.lat},${to.lng}`;
  let pending = segmentRoutes.get(key);
  if (!pending) {
    pending = (async () => {
      if (routeSlots > 0) routeSlots--;
      else await new Promise<void>((resolve) => routeQueue.push(resolve));
      try {
        const route = await osrm.getRoute(
          [from.lat, from.lng],
          [to.lat, to.lng],
        );
        return route?.geometry ?? null;
      } finally {
        const next = routeQueue.shift();
        if (next) next();
        else routeSlots++;
      }
    })();
    segmentRoutes.set(key, pending);
    // Rute yang gagal dicoba lagi pada pemuatan berikutnya.
    pending.then((geometry) => {
      if (!geometry) segmentRoutes.delete(key);
    });
  }
  return pending;
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function getColor(level: number): string {
  if (level < 40) return "#22c55e";
  if (level < 65) return "#eab308";
  return "#ef4444";
}
function getTrafficColor(level: number): string {
  if (level < 40) return "#4aaf51";
  if (level < 60) return "#f9b82a";
  if (level < 75) return "#f47b20";
  return "#d32029";
}

// ─── Intersection pin markers (teardrop + traffic light icon) ────────────────
const PIN_STATUS_COLORS = {
  green: "#4aaf51",
  yellow: "#f9b82a",
  orange: "#f47b20",
  red: "#d32029",
};
// Lampu yang menyala pada model lampu lalu lintas 3D per status kemacetan.
const PIN_LAMPS = {
  green: "green",
  yellow: "yellow",
  orange: "yellow",
  red: "red",
} as const;
function getLevelClass(level: number): "green" | "yellow" | "orange" | "red" {
  if (level < 40) return "green";
  if (level < 60) return "yellow";
  if (level < 75) return "orange";
  return "red";
}
// Hanya 8 varian tetap (4 warna x kritis/normal) — TIDAK ada angka persen di dalam SVG,
// badge persen ditampilkan lewat 'kritis-badge-layer' terpisah (text symbol).
function pinIconSVG(
  cls: "green" | "yellow" | "orange" | "red",
  kritis: boolean,
): string {
  const fill = PIN_STATUS_COLORS[cls];
  const badge = kritis
    ? `<circle cx="38.5" cy="9.5" r="7" fill="#d32029" stroke="white" stroke-width="1.8"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="56" viewBox="0 0 48 56">
  <ellipse cx="24" cy="53" rx="13" ry="3.5" fill="#3f0e16" opacity="0.3"/>
  <path d="M24 54 C20 46 6 36 6 22 A18 18 0 1 1 42 22 C42 36 28 46 24 54 Z" fill="${fill}" stroke="#5b1a26" stroke-width="2"/>
  <path d="M24 54 C20 46 6 36 6 22 A18 18 0 1 1 42 22 C42 36 28 46 24 54 Z" fill="none" stroke="white" stroke-width="1.2" opacity="0.35"/>
  <circle cx="24" cy="23" r="13.5" fill="white" stroke="${fill}" stroke-width="1.6"/>
  <circle cx="24" cy="14" r="3.2" fill="#ef4444"/>
  <circle cx="24" cy="23" r="3.2" fill="#eab308"/>
  <circle cx="24" cy="32" r="3.2" fill="#22c55e"/>
  ${badge}
</svg>`;
}
const svgDataUri = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function hasImage(map: MapLibreMap, id: string): boolean {
  return !!map.hasImage?.(id);
}

// PATCH: decode() sebelum addImage, pixelRatio 2 untuk HiDPI, dan logging
// per-image supaya kalau ada yang gagal keliatan jelas di console dengan
// nama icon-nya, bukan gagal diam-diam.
function registerStaticPinImages(
  mapRef: RefObject<MapLibreMap | null>,
): Promise<void> {
  const map = mapRef.current;
  if (!map) return Promise.resolve();
  const statuses: Array<keyof typeof PIN_STATUS_COLORS> = [
    "green",
    "yellow",
    "orange",
    "red",
  ];
  const pending: Promise<void>[] = [];
  statuses.forEach((st) => {
    ["", "-k"].forEach((suffix) => {
      const id = `pin-${st}${suffix}`;
      if (hasImage(map, id)) return;
      const svg = pinIconSVG(st, suffix === "-k");
      const img = new Image(48, 56);
      const p = new Promise<void>((resolve) => {
        img.onload = () => {
          const finish = () => {
            const m = mapRef.current;
            if (!m) {
              resolve();
              return;
            }
            if (!hasImage(m, id)) {
              try {
                m.addImage(id, img, { pixelRatio: 2 });
                console.log("[DigitalTwinMap] pin registered:", id);
              } catch (err) {
                console.error("[DigitalTwinMap] addImage failed for", id, err);
              }
            }
            resolve();
          };
          // decode() memastikan pixel data siap dipakai sebagai texture,
          // fallback ke finish langsung kalau browser tidak support decode()
          if (typeof img.decode === "function") {
            img
              .decode()
              .then(finish)
              .catch(() => finish());
          } else {
            finish();
          }
        };
        img.onerror = (e) => {
          console.error("[DigitalTwinMap] pin SVG failed to load:", id, e);
          resolve();
        };
      });
      img.src = svgDataUri(svg);
      pending.push(p);
    });
  });
  return Promise.all(pending).then(() => {
    console.log("[DigitalTwinMap] all pin images processed");
  });
}

const multFor = (time: number) =>
  (FORECAST_CONF[time] || FORECAST_CONF[0]).mult;

// ─── Tile / style configuration ────────────────────────────────────────────
// Basemap diambil dari MAP_STYLE_URL (lib/config/map.ts). Source elevasi untuk
// tampilan 3D ditambahkan terpisah setelah style dimuat.
const TERRAIN_TILES = [
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
];
const TERRAIN_ATTRIBUTION =
  '&copy; <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain</a>';

// ─── GeoJSON helpers ────────────────────────────────────────────────────────
type Feature = GeoJSON.Feature;
const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };
function lineFeature(
  coords: [number, number][],
  props: Record<string, unknown>,
): Feature {
  return {
    type: "Feature" as const,
    properties: props,
    geometry: { type: "LineString" as const, coordinates: coords },
  };
}
function pointFeature(
  coords: [number, number],
  props: Record<string, unknown>,
): Feature {
  return {
    type: "Feature" as const,
    properties: props,
    geometry: { type: "Point" as const, coordinates: coords },
  };
}

// ─── Marker HTML builders ───────────────────────────────────────────────────
const cctvIconHTML = () =>
  `<div style="background:#1e293b;border:2px solid white;border-radius:6px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.4);pointer-events:auto">${renderToString(<Video size={14} color="white" />)}</div>`;
const trafficLightIconHTML = (phase: "green" | "yellow" | "red") => {
  const c =
    phase === "green" ? "#22c55e" : phase === "yellow" ? "#eab308" : "#ef4444";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="${c}" stroke="${c}"/></svg>`;
  return `<div style="background:#111827;border:2px solid ${c};border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px ${c}88;pointer-events:auto">${svg}</div>`;
};
const eventIconHTML = () =>
  `<div style="background:#7c3aed;border:2px solid white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);pointer-events:auto">${renderToString(<CalendarDays size={12} color="white" />)}</div>`;
const crowdIconHTML = () =>
  `<div style="background:#dc2626;border:2px solid white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);pointer-events:auto">${renderToString(<AlertTriangle size={12} color="white" />)}</div>`;

// ─── Popup HTML builders ────────────────────────────────────────────────────
const NODE_STATUS_LABELS = {
  green: "Lancar",
  yellow: "Sedang",
  orange: "Padat",
  red: "Macet",
} as const;
// Popup pin: jarak dari titik pin per arah anchor, supaya card tidak menutupi pin.
// `pinHeight` = tinggi marker di layar (px): pin 2D atau model lampu 3D.
const SPRITE_PIN_HEIGHT = 40;
function nodePopupOffset(
  pinHeight: number,
): Record<
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right",
  [number, number]
> {
  const side = -Math.round(pinHeight * 0.45);
  return {
    center: [0, 0],
    top: [0, 8],
    bottom: [0, -pinHeight],
    left: [18, side],
    right: [-18, side],
    "top-left": [10, 8],
    "top-right": [-10, 8],
    "bottom-left": [10, -(pinHeight - 4)],
    "bottom-right": [-10, -(pinHeight - 4)],
  };
}
// Zoom minimum saat peta digeser ke sebuah ambulans.
const VEHICLE_FOCUS_ZOOM = 15.5;
// Di bawah kemiringan ini model 3D nyaris terlihat dari atas saja, jadi
// persimpangan memakai pin 2D.
const MODEL_MIN_PITCH = 20;
// Ruang kosong di atas pin untuk popup saat peta digeser ke pin yang diklik.
const DEFAULT_FOCUS_PADDING: PaddingOptions = {
  top: 240,
  bottom: 24,
  left: 24,
  right: 24,
};
function nodePopupHTML(
  node: TrafficNode,
  level: number,
  tab: string,
  forecastTime: number,
): string {
  const conf = FORECAST_CONF[forecastTime] || FORECAST_CONF[0];
  const modeLabel =
    tab === "live"
      ? "Status Live"
      : tab === "prediction"
        ? `Prediksi ${conf.label}`
        : "Mode Simulasi";
  const isKritis = node.predicted30 >= 85;
  const cls = getLevelClass(node.currentLevel);
  const secondaryAction =
    tab === "live" ? (node.recommendation ? "approve" : "detail") : "sim";
  const secondaryLabel =
    secondaryAction === "approve"
      ? "Approve AI"
      : secondaryAction === "detail"
        ? "Detail"
        : tab === "prediction"
          ? "Analisis Detail"
          : "Buka Simulasi";
  return renderToString(
    <NodePopupCard
      node={node}
      modeLabel={modeLabel}
      statusLabel={isKritis ? "Kritis" : NODE_STATUS_LABELS[cls]}
      statusColor={isKritis ? PIN_STATUS_COLORS.red : PIN_STATUS_COLORS[cls]}
      colorForLevel={getTrafficColor}
      forecast={
        tab === "live"
          ? undefined
          : {
              label: tab === "prediction" ? conf.label : "+25% Vol",
              value: level,
            }
      }
      secondaryAction={secondaryAction}
      secondaryLabel={secondaryLabel}
    />,
  );
}
function vehiclePopupContent(
  v: EmergencyVehicle,
  onClose: () => void,
  animated = false,
): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = renderToString(
    <VehiclePopupCard vehicle={v} animated={animated} />,
  );
  el.querySelector('[data-action="close"]')?.addEventListener("click", onClose);
  return el;
}
function cctvPopupHTML(node: TrafficNode, i: number): string {
  return `<div class="text-white p-3" style="font-family:inherit"><p style="font-weight:700;font-size:14px;margin:0">CCTV SITS-${String(i + 1).padStart(4, "0")}</p><p style="font-size:12px;color:rgba(255,255,255,0.6);margin:4px 0 0">${node.name}</p><p style="font-size:12px;color:#4ade80;font-weight:700;margin:4px 0 0">● Online</p></div>`;
}
function lightPopupHTML(node: TrafficNode, phase: string): string {
  const c =
    phase === "green" ? "#4ade80" : phase === "yellow" ? "#facc15" : "#f87171";
  return `<div class="text-white p-3" style="font-family:inherit"><p style="font-weight:700;font-size:14px;margin:0">${node.name}</p><p style="font-size:12px;font-weight:900;margin:6px 0 0;color:${c}">Fase: ${phase.toUpperCase()}</p><p style="font-size:12px;color:rgba(255,255,255,0.6);margin:4px 0 0">Durasi Hijau: ${phase === "green" ? "45s" : "30s"}</p></div>`;
}
function crowdPopupHTML(node: TrafficNode): string {
  return `<div class="text-white p-3" style="font-family:inherit"><p style="font-weight:700;font-size:14px;margin:0">Laporan Masyarakat</p><p style="font-size:12px;color:rgba(255,255,255,0.6);margin:4px 0 0">${node.name}</p><p style="font-size:12px;color:#f87171;font-weight:700;margin:4px 0 0">Kemacetan parah dilaporkan</p></div>`;
}
function eventPopupHTML(node: TrafficNode): string {
  return `<div class="text-white p-3" style="font-family:inherit"><p style="font-weight:700;font-size:14px;margin:0">Event Aktif</p><p style="font-size:12px;color:rgba(255,255,255,0.6);margin:4px 0 0">Sekitar ${node.name}</p><p style="font-size:12px;color:#c4b5fd;font-weight:700;margin:4px 0 0">Potensi peningkatan volume</p></div>`;
}

// ─── Sub-panels (rendered as absolute overlays on the map) ─────────────────

function LiveOverlayControls({
  overlays,
  setOverlays,
}: {
  overlays: OverlayState;
  setOverlays: (o: OverlayState) => void;
}) {
  const toggles: { key: keyof OverlayState; label: string; icon: string }[] = [
    { key: "cctv", label: "CCTV", icon: renderToString(<Video size={14} />) },
    {
      key: "lights",
      label: "Lampu",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`,
    },
    {
      key: "vehicles",
      label: "Vanguard",
      icon: renderToString(<AmbulanceIcon size={14} />),
    },
    {
      key: "crowd",
      label: "Laporan",
      icon: renderToString(<AlertTriangle size={14} />),
    },
    {
      key: "events",
      label: "Event",
      icon: renderToString(<CalendarDays size={14} />),
    },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 p-2">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1.5">
          OVERLAY
        </p>
        {toggles.map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setOverlays({ ...overlays, [key]: !overlays[key] })}
            className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg transition-all text-xs font-bold mb-0.5 ${
              overlays[key]
                ? "bg-[#111827] text-white"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            <span
              className="flex items-center justify-center w-5 h-5"
              dangerouslySetInnerHTML={{ __html: icon }}
            />{" "}
            {label}
          </button>
        ))}
      </div>
      {/* Legend */}
      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 p-2">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1.5">
          KONDISI
        </p>
        {[
          ["#4aaf51", "Lancar < 40%"],
          ["#f9b82a", "Sedang 40–60%"],
          ["#f47b20", "Padat 60–75%"],
          ["#d32029", "Macet > 75%"],
        ].map(([c, l]) => (
          <div key={c} className="flex items-center gap-2 px-1 py-0.5">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ background: c }}
            />
            <span className="text-[10px] font-medium text-slate-600">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ForecastTimeline({
  forecastTime,
  setForecastTime,
  confidence,
}: {
  forecastTime: number;
  setForecastTime: (t: number) => void;
  confidence: number;
}) {
  const times = [0, 15, 30, 60];
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[900]">
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-200 px-4 py-3 flex flex-col items-center gap-2 min-w-[320px]">
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            FORECAST TIMELINE
          </span>
          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
            Confidence: {confidence}%
          </span>
        </div>
        <div className="relative flex items-center w-full gap-0">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 z-0" />
          {times.map((t) => (
            <button
              key={t}
              onClick={() => setForecastTime(t)}
              className={`relative z-10 flex flex-col items-center flex-1 transition-all`}
            >
              <div
                className={`w-5 h-5 rounded-full border-2 transition-all ${
                  forecastTime === t
                    ? "bg-blue-600 border-blue-600 scale-125 shadow-lg shadow-blue-200"
                    : forecastTime > t
                      ? "bg-blue-200 border-blue-400"
                      : "bg-white border-slate-300"
                }`}
              />
              <span
                className={`text-[10px] mt-1.5 font-bold transition-colors ${
                  forecastTime === t ? "text-blue-700" : "text-slate-500"
                }`}
              >
                {t === 0 ? "Now" : `+${t}m`}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NodeDetailPanel({
  node,
  forecastTime,
  targetLevel,
  onClose,
  tab,
}: {
  node: TrafficNode;
  forecastTime: number;
  targetLevel: number;
  onClose: () => void;
  tab: string;
}) {
  const trend = targetLevel - node.currentLevel;
  const conf = FORECAST_CONF[forecastTime] || FORECAST_CONF[0];
  return (
    <div className="absolute top-3 right-3 z-[900] w-64">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-[#111827] px-4 py-3 flex justify-between items-center">
          <div>
            <p className="text-white font-bold text-sm leading-tight">
              {node.name}
            </p>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mt-0.5">
              {tab === "prediction"
                ? `Prediksi ${conf.label}`
                : "Analisis Node"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-lg"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Sekarang
              </p>
              <p
                className="text-2xl font-bold mt-0.5"
                style={{ color: getColor(node.currentLevel) }}
              >
                {node.currentLevel}%
              </p>
            </div>
            <div className="text-slate-400 flex items-center justify-center">
              <MoveRight size={24} />
            </div>
            <div className="flex-1 text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                {tab === "prediction" ? conf.label : "Simulasi"}
              </p>
              <p
                className="text-2xl font-bold mt-0.5"
                style={{ color: getColor(targetLevel) }}
              >
                {Math.round(targetLevel)}%
              </p>
            </div>
          </div>
          <div
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold ${
              trend > 0
                ? "bg-red-50 text-red-600"
                : trend < 0
                  ? "bg-green-50 text-green-600"
                  : "bg-slate-50 text-slate-500"
            }`}
          >
            <span>
              {trend > 0 ? (
                <TrendingUp size={16} />
              ) : trend < 0 ? (
                <TrendingDown size={16} />
              ) : (
                <MoveRight size={16} />
              )}
            </span>
            Trend: {trend > 0 ? "+" : ""}
            {trend.toFixed(0)}%
          </div>
          {tab === "prediction" && (
            <div className="flex justify-between text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
              <span>Confidence AI</span>
              <span className="font-bold text-blue-600">
                {conf.confidence}%
              </span>
            </div>
          )}
          {node.recommendation && (
            <div className="p-2.5 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider">
                REKOMENDASI AI
              </p>
              <p className="text-xs text-yellow-800 mt-1 font-medium">
                {node.recommendation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SimResult {
  congestion: number;
  travel: number;
  queue: number;
}
function SimulationPanel({
  node,
  onClose,
  onApprove,
}: {
  node: TrafficNode;
  onClose: () => void;
  onApprove?: (id: string, action: string) => void;
}) {
  const [scenario, setScenario] = useState("existing");
  const [result, setResult] = useState<SimResult | null>(null);
  const [running, setRunning] = useState(false);
  const selected = SCENARIOS.find((s) => s.id === scenario)!;

  const runSim = () => {
    setRunning(true);
    setResult(null);
    setTimeout(() => {
      setRunning(false);
      setResult({
        congestion: selected.congestion,
        travel: selected.travel,
        queue: selected.queue,
      });
    }, 1200);
  };

  const newLevel = result
    ? Math.max(
        0,
        Math.round(
          node.currentLevel + (node.currentLevel * result.congestion) / 100,
        ),
      )
    : null;
  const baseTravelMin = Math.round(node.currentLevel / 10);
  const newTravelMin = result
    ? Math.max(
        1,
        Math.round(baseTravelMin + (baseTravelMin * result.travel) / 100),
      )
    : null;
  const baseQueue = Math.round(node.currentLevel * 1.5);
  const newQueue = result
    ? Math.max(0, Math.round(baseQueue + (baseQueue * result.queue) / 100))
    : null;

  return (
    <div className="absolute top-3 right-3 z-[900] w-72">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-purple-900 px-4 py-3 flex justify-between items-center">
          <div>
            <p className="text-white font-bold text-sm leading-tight">
              {node.name}
            </p>
            <p className="text-purple-300 text-[10px] font-bold uppercase tracking-wider mt-0.5">
              Panel Simulasi Intervensi
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-purple-300 hover:text-white transition-colors text-lg"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Skenario Intervensi
            </p>
            <div className="space-y-1.5">
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setScenario(s.id);
                    setResult(null);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    scenario === s.id
                      ? "bg-purple-600 text-white shadow-sm"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={runSim}
            disabled={running}
            className="w-full py-2.5 bg-[#111827] hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {running ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Menjalankan...
              </>
            ) : (
              "▶ Jalankan Simulasi"
            )}
          </button>

          {result && newLevel !== null && (
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Hasil Simulasi
              </p>
              {[
                {
                  label: "Kemacetan",
                  before: `${node.currentLevel}%`,
                  after: `${newLevel}%`,
                  change: result.congestion,
                },
                {
                  label: "Waktu Tempuh",
                  before: `${baseTravelMin} mnt`,
                  after: `${newTravelMin} mnt`,
                  change: result.travel,
                },
                {
                  label: "Panjang Antrian",
                  before: `${baseQueue}m`,
                  after: `${newQueue}m`,
                  change: result.queue,
                },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-24 shrink-0 font-medium">
                    {row.label}
                  </span>
                  <span className="text-xs font-bold text-slate-700 text-right">
                    {row.before}
                  </span>
                  <span className="text-slate-400 text-xs">→</span>
                  <span
                    className={`text-xs font-bold ${row.change < 0 ? "text-green-600" : "text-slate-700"}`}
                  >
                    {row.after}
                  </span>
                  {row.change !== 0 && (
                    <span
                      className={`text-[10px] font-bold ml-auto px-1.5 py-0.5 rounded ${
                        row.change < 0
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {row.change > 0 ? "+" : ""}
                      {row.change}%
                    </span>
                  )}
                </div>
              ))}
              {scenario !== "existing" && onApprove && (
                <button
                  onClick={() => {
                    onApprove(node.id, scenario);
                    onClose();
                  }}
                  className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-xs transition-all mt-1"
                >
                  ✓ Terapkan Intervensi Ini
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Map Component ────────────────────────────────────────────────────
export default function DigitalTwinMapInner({
  nodes,
  vehicles,
  activeTab: requestedTab,
  onNodeSelect,
  onApprove,
  initialOverlays,
  topLeftSlot,
  focusPadding,
  focusVehicle,
}: MapInnerProps) {
  // Selama UI Prediction disembunyikan, peta selalu berjalan di mode Live.
  const activeTab =
    !SHOW_PREDICTION_UI && requestedTab === "prediction"
      ? "live"
      : requestedTab;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const popupRef = useRef<Popup | null>(null);
  const modelLayerRef = useRef<MapModelLayer | null>(null);
  const vehiclePopupRef = useRef<{ id: string; popup: Popup } | null>(null);
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  });
  const focusPaddingRef = useRef(focusPadding);
  useEffect(() => {
    focusPaddingRef.current = focusPadding;
  });
  const [mapReady, setMapReady] = useState(false);
  // Peta dibuka dalam keadaan miring (pitch 60) dengan terrain aktif.
  const [is3D, setIs3D] = useState(true);

  const [overlays, setOverlays] = useState<OverlayState>({
    cctv: false,
    lights: false,
    vehicles: true,
    crowd: false,
    events: false,
    ...initialOverlays,
  });
  const [forecastTime, setForecastTime] = useState(0);
  const [displayLevels, setDisplayLevels] = useState<Record<string, number>>(
    {},
  );
  const [selectedNode, setSelectedNode] = useState<TrafficNode | null>(null);
  const [sim3dNode, setSim3dNode] = useState<TrafficNode | null>(null);
  const [sim3dArms, setSim3dArms] = useState<DetectedArm[] | null>(null);
  const [roadSegments, setRoadSegments] = useState<RoadSegment[]>([]);
  const [vehicleRoutes, setVehicleRoutes] = useState<VehicleRoute[]>([]);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevTabRef = useRef(activeTab);
  const routeCacheRef = useRef<Map<string, VehicleRoute>>(new Map());

  // Load OSRM vehicle routes when vehicles change
  useEffect(() => {
    if (vehicles.length === 0) return;

    const loadRoutes = async () => {
      const routes: VehicleRoute[] = [];
      for (const v of vehicles) {
        const cacheKey = `${v.originLat},${v.originLng};${v.destLat},${v.destLng}`;
        const cached = routeCacheRef.current.get(cacheKey);
        if (cached) {
          routes.push(cached);
          continue;
        }

        const route = await osrm.getRoute(
          [v.originLat, v.originLng],
          [v.destLat, v.destLng],
          "driving",
          { alternatives: 0, steps: false, geometries: "geojson" },
        );

        if (route) {
          const vehicleRoute: VehicleRoute = {
            vehicleId: v.id,
            geometry: route.geometry,
            distance: route.distance / 1000,
            duration: route.duration / 60,
          };
          routeCacheRef.current.set(cacheKey, vehicleRoute);
          routes.push(vehicleRoute);
        } else {
          routes.push({
            vehicleId: v.id,
            geometry: [
              [v.originLat, v.originLng],
              [v.destLat, v.destLng],
            ],
            distance:
              Math.sqrt(
                Math.pow(v.destLat - v.originLat, 2) +
                  Math.pow(v.destLng - v.originLng, 2),
              ) * 111,
            duration: 0,
          });
        }
      }
      setVehicleRoutes(routes);
    };

    loadRoutes();
  }, [vehicles]);

  const getNodeDisplayLevel = useCallback(
    (node: TrafficNode): number => {
      if (activeTab === "live") return node.currentLevel;
      if (activeTab === "prediction")
        return displayLevels[node.id] ?? node.currentLevel;
      if (activeTab === "simulation")
        return Math.min(100, node.currentLevel * 1.25);
      return node.currentLevel;
    },
    [activeTab, displayLevels],
  );

  const loadRoadSegments = useCallback(async function (
    nodeList: TrafficNode[],
  ) {
    if (nodeList.length <= 1) {
      setRoadSegments([]);
      return;
    }
    const segments = await Promise.all(
      buildRoadConnections(nodeList).map(
        async ([fromNode, toNode]): Promise<RoadSegment> => {
          const geometry = await fetchSegmentRoute(fromNode, toNode);
          return {
            id: `route-${fromNode.id}-${toNode.id}`,
            fromNode,
            toNode,
            // Tanpa rute OSRM, ruas digambar sebagai garis lurus.
            geometry: geometry ?? [
              [fromNode.lat, fromNode.lng],
              [toNode.lat, toNode.lng],
            ],
            avgLevel: (fromNode.currentLevel + toNode.currentLevel) / 2,
          };
        },
      ),
    );
    setRoadSegments(segments);
  }, []);

  // Load OSRM road segments when nodes change
  useEffect(() => {
    if (nodes.length <= 1) return;
    const t = setTimeout(() => loadRoadSegments(nodes), 0);
    return () => clearTimeout(t);
  }, [nodes, loadRoadSegments]);

  // When tab changes, reset selection
  useEffect(() => {
    if (activeTab !== prevTabRef.current) {
      setSelectedNode(null);
      setForecastTime(0);
      prevTabRef.current = activeTab;
    }
  }, [activeTab]);

  // Traffic light phases derived from congestion level (mock)
  const getLightPhase = useCallback(
    (level: number): "green" | "yellow" | "red" => {
      if (level < 40) return "green";
      if (level < 65) return "yellow";
      return "red";
    },
    [],
  );

  // Animated transition when forecast time changes
  useEffect(() => {
    if (animRef.current) clearInterval(animRef.current);
    const mult = multFor(forecastTime);
    const targets: Record<string, number> = {};
    nodesRef.current.forEach((n) => {
      targets[n.id] = Math.min(100, n.currentLevel * mult);
    });

    let steps = 0;
    const maxSteps = 8;
    animRef.current = setInterval(() => {
      setDisplayLevels((prev) => {
        const next = { ...prev };
        nodesRef.current.forEach((n) => {
          const diff = targets[n.id] - (prev[n.id] ?? n.currentLevel);
          next[n.id] = (prev[n.id] ?? n.currentLevel) + diff * 0.4;
        });
        return next;
      });
      steps++;
      if (steps >= maxSteps) clearInterval(animRef.current!);
    }, 80);

    return () => {
      if (animRef.current) clearInterval(animRef.current);
    };
  }, [forecastTime]);

  // Latest handlers for map event callbacks
  const latestRef = useRef({
    nodes,
    vehicles,
    activeTab,
    onNodeSelect,
    onApprove,
    forecastTime,
    getNodeDisplayLevel,
    setSelectedNode,
  });
  useEffect(() => {
    latestRef.current = {
      nodes,
      vehicles,
      activeTab,
      onNodeSelect,
      onApprove,
      forecastTime,
      getNodeDisplayLevel,
      setSelectedNode,
    };
  }, [
    nodes,
    vehicles,
    activeTab,
    onNodeSelect,
    onApprove,
    forecastTime,
    getNodeDisplayLevel,
    setSelectedNode,
  ]);

  const openNodePopup = (node: TrafficNode, lngLat: [number, number]) => {
    const map = mapRef.current;
    if (!map) return;
    const {
      activeTab: tab,
      forecastTime,
      onApprove,
      onNodeSelect,
    } = latestRef.current;
    const level = latestRef.current.getNodeDisplayLevel(node);

    popupRef.current?.remove();
    const el = document.createElement("div");
    el.innerHTML = nodePopupHTML(node, level, tab, forecastTime);

    el.querySelector('[data-action="approve"]')?.addEventListener(
      "click",
      () => {
        if (onApprove) onApprove(node.id, "approve");
        popupRef.current?.remove();
      },
    );
    el.querySelector('[data-action="detail"]')?.addEventListener(
      "click",
      () => {
        if (tab === "live") onNodeSelect(node);
        else latestRef.current.setSelectedNode(node);
        popupRef.current?.remove();
      },
    );
    el.querySelector('[data-action="sim"]')?.addEventListener("click", () => {
      latestRef.current.setSelectedNode(node);
      popupRef.current?.remove();
    });
    el.querySelector('[data-action="sim3d"]')?.addEventListener(
      "click",
      () => {
        // Bentuk simpang (jumlah lengan dan arahnya) dibaca dari data jalan di peta.
        setSim3dArms(detectJunctionFromMap(map, node));
        setSim3dNode(node);
        popupRef.current?.remove();
      },
    );

    el.querySelector('[data-action="close"]')?.addEventListener(
      "click",
      () => {
        popupRef.current?.remove();
      },
    );

    const layer = modelLayerRef.current;
    const modelHeight = layer?.nodesVisible
      ? layer.getNodeScreenHeight(node.id)
      : null;
    popupRef.current = new Popup({
      offset: nodePopupOffset(
        modelHeight === null ? SPRITE_PIN_HEIGHT : Math.round(modelHeight) + 8,
      ),
      closeButton: false,
      maxWidth: "none",
      className: "sparta-node-popup",
    })
      .setLngLat(lngLat)
      .setDOMContent(el)
      .addTo(map);

    // Geser peta supaya pin dan popup berada di area yang tidak tertutup panel.
    map.easeTo({
      center: [node.lng, node.lat],
      padding: { ...DEFAULT_FOCUS_PADDING, ...focusPaddingRef.current },
      duration: 450,
    });
  };

  // Popup ambulans 3D: klik membuka, klik lagi pada ambulans yang sama menutup.
  const toggleVehiclePopup = (id: string) => {
    const map = mapRef.current;
    const open = vehiclePopupRef.current;
    open?.popup.remove();
    if (!map || open?.id === id) return;
    const vehicle = latestRef.current.vehicles.find((v) => v.id === id);
    const state = modelLayerRef.current?.getVehicleState(id);
    if (!vehicle || !state) return;

    const popup = new Popup({
      offset: Math.round(state.screenHeight) + 8,
      closeButton: false,
      maxWidth: "none",
      className: "sparta-node-popup",
    }).setLngLat(state.lngLat);
    popup
      .setDOMContent(vehiclePopupContent(vehicle, () => popup.remove(), true))
      .addTo(map);
    popup.on("close", () => {
      if (vehiclePopupRef.current?.popup === popup)
        vehiclePopupRef.current = null;
    });
    vehiclePopupRef.current = { id, popup };
  };

  // ─── Map initialization ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    console.log(
      "[DigitalTwinMap] INIT STARTED",
      containerRef.current.getBoundingClientRect(),
    );
    const map = new MapLibreMap({
      container: containerRef.current,
      center: [112.74, -7.28],
      zoom: 12.5,
      pitch: 60,
      bearing: -20,
      maxPitch: 85,
      minZoom: 3,
      style: MAP_STYLE_URL,
      attributionControl: { compact: true },
      // Antialias supaya tepi model 3D (layer three.js) tidak bergerigi.
      canvasContextAttributes: { antialias: true },
    });
    mapRef.current = map;
    map.addControl(
      new NavigationControl({ visualizePitch: true, showCompass: true }),
      "bottom-left",
    );

    setTimeout(() => {
      map.resize();
    }, 100);

    map.on("load", () => {
      console.log("[DigitalTwinMap] MAP LOADED");
      map.resize();

      map.on("sourcedata", (e) => {
        if (e.sourceId === "nodes") {
          console.log(
            "[DigitalTwinMap] SOURCE DATA nodes, isSourceLoaded:",
            e.isSourceLoaded,
          );
        }
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any).on("tileerror", (e: any) => {
        console.error("[DigitalTwinMap] TILE ERROR", e);
      });

      if (!map.getSource("segments"))
        map.addSource("segments", { type: "geojson", data: EMPTY_FC });
      if (!map.getSource("nodes"))
        map.addSource("nodes", { type: "geojson", data: EMPTY_FC });
      if (!map.getSource("vehicle-routes"))
        map.addSource("vehicle-routes", { type: "geojson", data: EMPTY_FC });
      if (!map.getSource("terrain")) {
        map.addSource("terrain", {
          type: "raster-dem",
          tiles: TERRAIN_TILES,
          encoding: "terrarium",
          tileSize: 256,
          maxzoom: 15,
          attribution: TERRAIN_ATTRIBUTION,
        });
      }
      if (!map.getSource("openmaptiles")) {
        map.addSource("openmaptiles", {
          type: "vector",
          url: "https://tiles.openfreemap.org/planet",
        });
      }

      // Bangunan 3D dan garis kepadatan disisipkan di bawah label basemap.
      const labelLayerId = map
        .getStyle()
        .layers.find((layer) => layer.type === "symbol")?.id;

      if (!map.getLayer("3d-buildings")) {
        map.addLayer({
          id: "3d-buildings",
          type: "fill-extrusion",
          source: "openmaptiles",
          "source-layer": "building",
          minzoom: 14,
          paint: {
            "fill-extrusion-color": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "render_height"], 8],
              0,
              "#e5e7eb",
              20,
              "#d1d5db",
              50,
              "#9ca3af",
              100,
              "#4b5563",
            ],
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
            "fill-extrusion-base": [
              "coalesce",
              ["get", "render_min_height"],
              0,
            ],
            "fill-extrusion-opacity": 0.85,
          },
        }, labelLayerId);
      }

      if (!map.getLayer("segments-casing")) {
        map.addLayer({
          id: "segments-casing",
          type: "line",
          source: "segments",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": 9,
            "line-opacity": 0.55,
          },
        }, labelLayerId);
      }
      if (!map.getLayer("segments-layer")) {
        map.addLayer({
          id: "segments-layer",
          type: "line",
          source: "segments",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 5.5,
            "line-opacity": 0.85,
          },
        }, labelLayerId);
      }
      if (!map.getLayer("veh-bg")) {
        map.addLayer({
          id: "veh-bg",
          type: "line",
          source: "vehicle-routes",
          filter: ["==", ["get", "kind"], "bg"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#475569",
            "line-width": 2,
            "line-opacity": 0.35,
            "line-dasharray": [6, 5],
          },
        });
      }
      if (!map.getLayer("veh-done")) {
        map.addLayer({
          id: "veh-done",
          type: "line",
          source: "vehicle-routes",
          filter: ["==", ["get", "kind"], "done"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 5,
            "line-opacity": 0.85,
          },
        });
      }
      if (!map.getLayer("veh-rem")) {
        map.addLayer({
          id: "veh-rem",
          type: "line",
          source: "vehicle-routes",
          filter: ["==", ["get", "kind"], "rem"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#ef4444",
            "line-width": 4,
            "line-opacity": 0.55,
            "line-dasharray": [5, 4],
          },
        });
      }
      if (!map.getLayer("veh-origin")) {
        map.addLayer({
          id: "veh-origin",
          type: "circle",
          source: "vehicle-routes",
          filter: ["==", ["get", "kind"], "origin"],
          paint: {
            "circle-color": "#3b82f6",
            "circle-radius": 5,
            "circle-stroke-color": "#1e293b",
            "circle-stroke-width": 2,
          },
        });
      }
      if (!map.getLayer("veh-dest")) {
        map.addLayer({
          id: "veh-dest",
          type: "circle",
          source: "vehicle-routes",
          filter: ["==", ["get", "kind"], "dest"],
          paint: {
            "circle-color": "#ef4444",
            "circle-radius": 7,
            "circle-opacity": 0.25,
            "circle-stroke-color": "#ef4444",
            "circle-stroke-width": 3,
          },
        });
      }
      if (!map.getLayer("nodes-layer")) {
        map.addLayer({
          id: "nodes-layer",
          type: "symbol",
          source: "nodes",
          layout: {
            "icon-image": ["get", "icon"],
            "icon-size": [
              "interpolate",
              ["exponential", 1.6],
              ["zoom"],
              8,
              ["*", 0.5, ["get", "size"]],
              12,
              ["*", 0.8, ["get", "size"]],
              15,
              ["*", 1, ["get", "size"]],
              17,
              ["*", 1.15, ["get", "size"]],
            ],
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        });
      }
      if (!map.getLayer("badges-layer")) {
        map.addLayer({
          id: "badges-layer",
          type: "symbol",
          source: "nodes",
          filter: ["get", "showBadge"],
          layout: {
            "text-field": [
              "concat",
              "⚠ +",
              ["to-string", ["get", "time"]],
              "m: ",
              ["to-string", ["get", "level"]],
              "%",
            ],
            "text-size": 10,
            "text-font": MAP_LABEL_FONT,
            "text-offset": [0, -5],
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#1e1b4b",
            "text-halo-width": 1.4,
          },
        });
      }

      map.setTerrain({ source: "terrain", exaggeration: 1.3 });

      if (!map.getLayer("kritis-badge-layer")) {
        map.addLayer({
          id: "kritis-badge-layer",
          type: "symbol",
          source: "nodes",
          filter: ["==", ["get", "kritis"], true],
          layout: {
            "text-field": ["concat", ["to-string", ["get", "percent"]], "%"],
            // "zoom" hanya boleh dipakai di interpolate/step paling luar, jadi
            // faktor x10 dimasukkan ke nilai stop-nya.
            "text-size": [
              "interpolate",
              ["exponential", 1.6],
              ["zoom"],
              8,
              5,
              12,
              8,
              15,
              10,
              17,
              11.5,
            ],
            "text-font": MAP_LABEL_FONT,
            // Di kanan titik merah pada pin (ikon didaftarkan dengan pixelRatio 2).
            "text-anchor": "left",
            "text-offset": [1.25, -2.35],
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": "#7f1d1d",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.4,
          },
        });
      }

      // Marker 3D: lampu lalu lintas di persimpangan dan ambulans di rutenya.
      const modelLayer = new MapModelLayer();
      map.addLayer(modelLayer);
      modelLayerRef.current = modelLayer;

      // Peta miring -> persimpangan digambar sebagai model 3D; peta datar
      // (tampilan 2D) -> kembali ke pin 2D.
      const syncNodeMarkerMode = () => {
        const use3D = map.getPitch() >= MODEL_MIN_PITCH;
        if (modelLayer.nodesVisible === use3D) return;
        modelLayer.setNodesVisible(use3D);
        ["nodes-layer", "kritis-badge-layer"].forEach((id) =>
          map.setLayoutProperty(id, "visibility", use3D ? "none" : "visible"),
        );
      };
      map.on("pitch", syncNodeMarkerMode);
      syncNodeMarkerMode();

      // Marker di bawah kursor: model 3D dulu, lalu pin 2D.
      const markerAt = (e: MapMouseEvent) =>
        modelLayer.pick(e.point) ??
        map
          .queryRenderedFeatures(e.point, { layers: ["nodes-layer"] })
          .slice(0, 1)
          .map((f) => ({ kind: "node" as const, id: String(f.properties.id) }))[0];

      map.on("click", (e: MapMouseEvent) => {
        const hit = markerAt(e);
        if (hit?.kind === "vehicle") {
          toggleVehiclePopup(hit.id);
          return;
        }
        const node = latestRef.current.nodes.find((n) => n.id === hit?.id);
        if (!node) return;
        const { activeTab: tab, onApprove, onNodeSelect } = latestRef.current;
        if (tab === "live") {
          if (onApprove && node.recommendation) onApprove(node.id, "approve");
          else onNodeSelect(node);
        } else {
          latestRef.current.setSelectedNode((prev) =>
            prev?.id === node.id ? null : node,
          );
        }
        const lngLat: [number, number] = [node.lng, node.lat];
        openNodePopup(node, lngLat);
      });
      map.on("mousemove", (e: MapMouseEvent) => {
        map.getCanvas().style.cursor = markerAt(e) ? "pointer" : "";
      });

      // PATCH: registrasi image dulu, baru mapReady true — supaya effect yang
      // mem-push feature ke source 'nodes' selalu jalan SETELAH semua icon
      // sudah terdaftar di map (icon-image tidak akan hilang begitu terdaftar).
      registerStaticPinImages(mapRef).then(() => {
        console.log("[DigitalTwinMap] setMapReady(true) — pin images ready");
        setMapReady(true);
      });
    });

    map.on("error", (e) => {
      console.error(
        "[DigitalTwinMap] MAP ERROR",
        e?.error?.message || e.error || e,
      );
    });

    const markers = markersRef.current;
    return () => {
      markers.forEach((m) => m.remove());
      markers.clear();
      popupRef.current?.remove();
      vehiclePopupRef.current?.popup.remove();
      modelLayerRef.current?.dispose();
      modelLayerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const toggle3D = () => {
    const map = mapRef.current;
    if (!map) return;
    if (is3D) {
      map.easeTo({ pitch: 0, bearing: 0 });
      map.setTerrain(null);
    } else {
      map.easeTo({ pitch: 60, bearing: -20 });
      map.setTerrain({ source: "terrain", exaggeration: 1.3 });
    }
    setIs3D(!is3D);
  };

  // ─── Data updates ────────────────────────────────────────────────────────
  // Road segments source
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("segments");
    if (!source) return;

    const features: Feature[] = [];
    const mult = multFor(forecastTime);
    if (roadSegments.length > 0) {
      roadSegments.forEach((s) => {
        const pred =
          activeTab === "prediction"
            ? Math.min(100, s.avgLevel * mult)
            : s.avgLevel;
        features.push(
          lineFeature(
            s.geometry.map(([la, ln]): [number, number] => [ln, la]),
            { color: getTrafficColor(pred) },
          ),
        );
      });
    } else {
      buildRoadConnections(nodes).forEach(([from, to]) => {
        const avg = (getNodeDisplayLevel(from) + getNodeDisplayLevel(to)) / 2;
        const pred =
          activeTab === "prediction" ? Math.min(100, avg * mult) : avg;
        features.push(
          lineFeature(
            [
              [from.lng, from.lat],
              [to.lng, to.lat],
            ],
            { color: getTrafficColor(pred) },
          ),
        );
      });
    }
    (source as GeoJSONSource).setData({ type: "FeatureCollection", features });
  }, [
    roadSegments,
    nodes,
    activeTab,
    forecastTime,
    displayLevels,
    mapReady,
    getNodeDisplayLevel,
  ]);

  // Node markers source (icon pin, image sudah pasti terdaftar sebelum ini jalan)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource("nodes");
    if (!source) return;

    console.log(
      "[DigitalTwinMap] building node features, nodes.length =",
      nodes.length,
    );

    const features = nodes.map((n) => {
      const level = getNodeDisplayLevel(n);
      const cls = getLevelClass(level);
      const isKritis = n.predicted30 >= 85;
      return pointFeature([n.lng, n.lat], {
        id: n.id,
        name: n.name,
        level: Math.round(level),
        percent: Math.round(level),
        time: forecastTime,
        kritis: isKritis,
        showBadge:
          activeTab === "prediction" && forecastTime !== 0 && level >= 70,
        icon: `pin-${cls}${isKritis ? "-k" : ""}`,
        size: selectedNode?.id === n.id ? 1.3 : 1,
      });
    });

    console.log(
      "[DigitalTwinMap] node features pushed to source:",
      features.length,
    );
    (source as GeoJSONSource).setData({ type: "FeatureCollection", features });

    // Data yang sama untuk marker 3D (dipakai saat peta miring).
    modelLayerRef.current?.setNodes(
      nodes.map((n) => {
        const level = getNodeDisplayLevel(n);
        return {
          id: n.id,
          lng: n.lng,
          lat: n.lat,
          color: PIN_STATUS_COLORS[getLevelClass(level)],
          lamp: PIN_LAMPS[getLevelClass(level)],
          kritis: n.predicted30 >= 85,
          percent: Math.round(level),
          selected: selectedNode?.id === n.id,
        };
      }),
    );
  }, [
    nodes,
    displayLevels,
    selectedNode,
    activeTab,
    forecastTime,
    mapReady,
    getNodeDisplayLevel,
  ]);

  // Ambulans 3D + garis rutenya. Layer 3D menghaluskan progres antar polling,
  // jadi garis "sudah dilewati" dan popup mengikuti posisi model, bukan angka
  // progres mentah dari server.
  useEffect(() => {
    const map = mapRef.current;
    const layer = modelLayerRef.current;
    if (!map || !mapReady || !layer) return;
    const source = map.getSource("vehicle-routes");
    if (!source) return;

    const paths = vehicles.map((v) => {
      const route = vehicleRoutes.find((r) => r.vehicleId === v.id);
      const geo =
        route?.geometry ??
        ([
          [v.originLat, v.originLng],
          [v.destLat, v.destLng],
        ] as [number, number][]);
      return geo.map(([la, ln]): [number, number] => [ln, la]);
    });
    layer.setVehicles(
      vehicles.map((v, i) => ({
        id: v.id,
        path: paths[i],
        progress: v.progress,
        greenWaveOn: v.greenWaveOn,
      })),
    );

    const openPopup = vehiclePopupRef.current;
    if (openPopup) {
      const vehicle = vehicles.find((v) => v.id === openPopup.id);
      if (vehicle)
        openPopup.popup.setDOMContent(
          vehiclePopupContent(vehicle, () => openPopup.popup.remove()),
        );
      else openPopup.popup.remove();
    }

    let lastKey = "";
    const syncRoutes = () => {
      const states = vehicles.map((v) => layer.getVehicleState(v.id));
      const key = states
        .map((s) => (s ? `${s.segment}:${s.progress.toFixed(5)}` : "-"))
        .join("|");
      if (key === lastKey) return;
      lastKey = key;

      const features: Feature[] = [];
      vehicles.forEach((v, i) => {
        const coords = paths[i];
        const state = states[i];
        features.push(lineFeature(coords, { kind: "bg" }));
        if (state && coords.length >= 2) {
          features.push(
            lineFeature([...coords.slice(0, state.segment + 1), state.lngLat], {
              kind: "done",
              color: v.greenWaveOn ? "#22c55e" : "#3b82f6",
            }),
            lineFeature([state.lngLat, ...coords.slice(state.segment + 1)], {
              kind: "rem",
            }),
          );
        }
        features.push(
          pointFeature([v.originLng, v.originLat], { kind: "origin" }),
        );
        features.push(pointFeature([v.destLng, v.destLat], { kind: "dest" }));
      });
      (source as GeoJSONSource).setData({
        type: "FeatureCollection",
        features,
      });

      const tracked = vehiclePopupRef.current;
      const trackedState = tracked && layer.getVehicleState(tracked.id);
      if (tracked && trackedState) tracked.popup.setLngLat(trackedState.lngLat);
    };
    syncRoutes();
    const timer = setInterval(syncRoutes, 250);
    return () => clearInterval(timer);
  }, [vehicles, vehicleRoutes, mapReady]);

  // Geser peta ke ambulans yang dipilih di panel halaman.
  useEffect(() => {
    const map = mapRef.current;
    const state =
      focusVehicle && modelLayerRef.current?.getVehicleState(focusVehicle.id);
    if (!map || !mapReady || !state) return;
    map.easeTo({
      center: state.lngLat,
      zoom: Math.max(map.getZoom(), VEHICLE_FOCUS_ZOOM),
      padding: { ...DEFAULT_FOCUS_PADDING, ...focusPaddingRef.current },
      duration: 900,
    });
  }, [focusVehicle, mapReady]);

  // Vehicle layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const visible = activeTab === "live" ? overlays.vehicles : true;
    ["veh-bg", "veh-done", "veh-rem", "veh-origin", "veh-dest"].forEach(
      (id) => {
        if (map.getLayer(id))
          map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      },
    );
    modelLayerRef.current?.setVehiclesVisible(visible);
    if (!visible) vehiclePopupRef.current?.popup.remove();
  }, [overlays.vehicles, activeTab, mapReady]);

  // Overlay markers (CCTV / lights / crowd / events)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (activeTab !== "live") {
      markersRef.current.forEach((m, k) => {
        if (k.startsWith("ov-")) {
          m.remove();
          markersRef.current.delete(k);
        }
      });
      return;
    }

    const wanted = new Set<string>();
    const upsert = (
      key: string,
      html: string,
      lngLat: [number, number],
      popupHTML?: string,
    ) => {
      wanted.add(key);
      const existing = markersRef.current.get(key);
      if (existing) {
        existing.getElement().innerHTML = html;
        existing.setLngLat(lngLat);
      } else {
        const el = document.createElement("div");
        el.innerHTML = html;
        const marker = new Marker({ element: el }).setLngLat(lngLat);
        if (popupHTML)
          marker.setPopup(
            new Popup({
              offset: 20,
              closeButton: false,
              maxWidth: "300px",
            }).setHTML(popupHTML),
          );
        marker.addTo(map);
        markersRef.current.set(key, marker);
      }
    };

    if (overlays.cctv) {
      nodes.forEach((n, i) =>
        upsert(
          `ov-cctv-${n.id}`,
          cctvIconHTML(),
          [n.lng - 0.0015, n.lat + 0.0015],
          cctvPopupHTML(n, i),
        ),
      );
    }
    if (overlays.lights) {
      nodes.forEach((n) =>
        upsert(
          `ov-light-${n.id}`,
          trafficLightIconHTML(getLightPhase(n.currentLevel)),
          [n.lng + 0.001, n.lat - 0.001],
          lightPopupHTML(n, getLightPhase(n.currentLevel)),
        ),
      );
    }
    if (overlays.crowd) {
      nodes
        .filter((n) => n.currentLevel > 60)
        .forEach((n) =>
          upsert(
            `ov-crowd-${n.id}`,
            crowdIconHTML(),
            [n.lng + 0.002, n.lat + 0.001],
            crowdPopupHTML(n),
          ),
        );
    }
    if (overlays.events) {
      nodes
        .slice(0, 2)
        .forEach((n) =>
          upsert(
            `ov-event-${n.id}`,
            eventIconHTML(),
            [n.lng - 0.001, n.lat - 0.002],
            eventPopupHTML(n),
          ),
        );
    }

    markersRef.current.forEach((m, k) => {
      if (k.startsWith("ov-") && !wanted.has(k)) {
        m.remove();
        markersRef.current.delete(k);
      }
    });
  }, [overlays, nodes, activeTab, mapReady, getLightPhase]);

  return (
    <div className="relative w-full h-full min-h-[500px]">
      <style>{`
        .maplibregl-popup-content {
          background: #111827 !important;
          color: white !important;
          border-radius: 14px !important;
          padding: 0 !important;
          overflow: hidden !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
        }
        .maplibregl-popup-tip {
          border-top-color: #111827 !important;
        }
        .maplibregl-popup-close-button { display: none !important; }
        .maplibregl-map .maplibregl-canvas-container.maplibregl-interactive,
        .maplibregl-map.maplibregl-interactive {
          cursor: grab;
        }
        .maplibregl-map.maplibregl-touch-zoom-rotate,
        .maplibregl-map.maplibregl-touch-drag-pan { touch-action: pan-x pan-y; }
        /* Popup kartu (persimpangan, ambulans): chrome bawaan dihilangkan, card dibangun sendiri */
        .maplibregl-popup.sparta-node-popup { z-index: 950; }
        .sparta-node-popup .maplibregl-popup-content {
          background: transparent !important;
          color: inherit !important;
          border-radius: 0 !important;
          overflow: visible !important;
          box-shadow: none !important;
        }
        .sparta-node-popup .maplibregl-popup-tip { display: none !important; }
      `}</style>

      {/* Floating overlays (rendered over the map) */}
      <div className="absolute inset-0 z-[800] pointer-events-none">
        <div className="pointer-events-auto">
          <div className="absolute top-3 left-3 z-[900] flex flex-col items-start gap-1.5">
            {topLeftSlot}
            {activeTab === "live" && (
              <LiveOverlayControls
                overlays={overlays}
                setOverlays={setOverlays}
              />
            )}
          </div>
          {activeTab === "prediction" && (
            <ForecastTimeline
              forecastTime={forecastTime}
              setForecastTime={setForecastTime}
              confidence={
                (FORECAST_CONF[forecastTime] || FORECAST_CONF[0]).confidence
              }
            />
          )}
          {selectedNode && activeTab === "prediction" && (
            <NodeDetailPanel
              node={selectedNode}
              forecastTime={forecastTime}
              targetLevel={getNodeDisplayLevel(selectedNode)}
              tab="prediction"
              onClose={() => setSelectedNode(null)}
            />
          )}
          {selectedNode && activeTab === "simulation" && (
            <SimulationPanel
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
              onApprove={onApprove}
            />
          )}
        </div>
      </div>

      {/* 3D / 2D toggle */}
      <button
        onClick={toggle3D}
        className="absolute bottom-[10px] left-[49px] z-[900] px-3 py-2 rounded-xl bg-white/95 backdrop-blur-sm border border-slate-200 shadow-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
        title={is3D ? "Kembali ke tampilan 2D" : "Aktifkan tampilan 3D"}
      >
        <span
          className={`w-2 h-2 rounded-full ${is3D ? "bg-blue-600" : "bg-slate-300"}`}
        />
        {is3D ? "3D ON" : "3D OFF"}
      </button>

      {/* Panel simulasi 3D simpang — hanya di-mount saat dibuka */}
      {sim3dNode && (
        <IntersectionSimPanel
          node={sim3dNode}
          arms={sim3dArms}
          onClose={() => setSim3dNode(null)}
        />
      )}

      {/* MapLibre GL map — single ref, must be the only element with containerRef */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
