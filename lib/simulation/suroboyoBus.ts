// Simulasi armada Suroboyo Bus untuk pelacakan di peta dan halaman Vanguard.
//
// Koridor, halte, dan simpang bersinyal berasal dari OpenStreetMap
// (lib/data/suroboyoBusRoutes.json, dibuat scripts/build-suroboyo-bus-data.mjs).
// Posisi bus BUKAN data GPS: tiap bus mengikuti jadwal putaran koridornya
// (melaju antar halte, berhenti di halte dan lampu merah) dengan keterlambatan
// yang naik-turun pelan. Semuanya fungsi murni dari waktu, jadi semua halaman
// dan semua klien melihat armada yang sama tanpa menulis apa pun ke database.
import routeData from "@/lib/data/suroboyoBusRoutes.json";
import { fnv1a, mulberry32 } from "@/lib/sim/rng";

export type LngLat = [number, number];

export interface BusStop {
  name: string;
  /** Jarak dari awal arah ini (m). */
  at: number;
  lngLat: LngLat;
}
export interface BusDirection {
  id: string;
  from: string;
  to: string;
  length: number;
  path: LngLat[];
  stops: BusStop[];
  signals: BusStop[];
}
/** Titik henti pada putaran koridor: halte atau simpang bersinyal. */
export interface RouteEvent {
  kind: "stop" | "signal";
  name: string;
  direction: 0 | 1;
  /** Jarak dari awal putaran (m). */
  at: number;
  lngLat: LngLat;
  /** Detik sejak awal putaran: tiba dan berangkat menurut jadwal. */
  arrive: number;
  depart: number;
}
export interface BusRoute {
  id: string;
  name: string;
  corridor: string;
  color: string;
  directions: [BusDirection, BusDirection];
  /** Arah berangkat disambung arah pulang; bus berputar di jalur ini. */
  loopPath: LngLat[];
  loopLength: number;
  /** Lama satu putaran penuh menurut jadwal (detik). */
  cycle: number;
  events: RouteEvent[];
}
export interface Bus {
  id: string;
  /** Kode lambung, mis. "SB-07". */
  code: string;
  route: BusRoute;
  /** Selisih jadwal terhadap bus pertama di koridor (detik). */
  offset: number;
  delay: { base: number; a1: number; p1: number; f1: number; a2: number; p2: number; f2: number };
}
export interface BusSnapshot {
  bus: Bus;
  /** Posisi pada putaran koridor, 0..1 dari `route.loopLength`. */
  progress: number;
  direction: BusDirection;
  /** Keterlambatan terhadap jadwal (detik, negatif = lebih awal). */
  delaySec: number;
  late: boolean;
  /** Nama halte bila bus sedang berhenti menaik-turunkan penumpang. */
  dwellingAt: string | null;
  moving: boolean;
  speedKmh: number;
}
export interface Arrival {
  event: RouteEvent;
  /** Indeks pada `route.events`. */
  eventIndex: number;
  etaSec: number;
}
export interface SignalAdjustment {
  key: string;
  routeId: string;
  name: string;
  lngLat: LngLat;
  busCode: string;
  etaSec: number;
  /** Tambahan fase hijau (detik). */
  extendSec: number;
}
export interface AdjustmentLogEntry {
  key: string;
  timeMs: number;
  name: string;
  routeId: string;
  busCode: string;
  /** 0 = siklus normal (bus masih dalam toleransi). */
  extendSec: number;
}

/** Bus dianggap terlambat bila tertinggal lebih dari ini (detik). */
export const LATE_THRESHOLD_SEC = 60;
/** Prioritas sinyal dipertimbangkan sejak bus tertinggal sebanyak ini (detik). */
const PRIORITY_WATCH_SEC = 20;
/** Simpang disesuaikan saat bus terlambat diperkirakan tiba dalam selang ini (detik). */
const PRIORITY_HORIZON_SEC = 90;
const TERMINAL_LAYOVER_SEC = 120;
const BUSES_PER_ROUTE: Record<string, number> = { R1: 5, R2: 4, R4: 3, R5: 3 };

// ─── Geometri ───────────────────────────────────────────────────────────────
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG = 111320 * Math.cos((-7.28 * Math.PI) / 180);
function meters(a: LngLat, b: LngLat): number {
  return Math.hypot(
    (b[0] - a[0]) * M_PER_DEG_LNG,
    (b[1] - a[1]) * M_PER_DEG_LAT,
  );
}

// ─── Jadwal putaran koridor ─────────────────────────────────────────────────
function buildRoute(raw: (typeof routeData.routes)[number]): BusRoute {
  const directions = raw.directions as unknown as [BusDirection, BusDirection];
  const [out, back] = directions;
  // Ujung arah berangkat dan awal arah pulang bisa terpaut beberapa puluh meter.
  const backOffset =
    out.length + meters(out.path[out.path.length - 1], back.path[0]);
  const loopLength = backOffset + back.length;
  const random = mulberry32(fnv1a(`suroboyo-bus:${raw.id}`));

  const points = directions
    .flatMap((direction, index) => {
      const base = index === 0 ? 0 : backOffset;
      const of = (kind: RouteEvent["kind"]) => (p: BusStop) => ({
        kind,
        name: p.name,
        direction: index as 0 | 1,
        at: base + p.at,
        lngLat: p.lngLat,
        last: kind === "stop" && p === direction.stops[direction.stops.length - 1],
      });
      return [...direction.stops.map(of("stop")), ...direction.signals.map(of("signal"))];
    })
    .sort((a, b) => a.at - b.at);

  const events: RouteEvent[] = [];
  let clock = 0;
  points.forEach(({ last, ...point }, i) => {
    let dwell: number;
    if (point.kind === "signal") {
      // Sekitar 40% simpang dilewati saat hijau, sisanya menunggu lampu merah.
      const wait = random() * 46 - 18;
      dwell = wait > 4 ? wait : 0;
    } else {
      dwell = last ? TERMINAL_LAYOVER_SEC : 18 + random() * 14;
    }
    events.push({ ...point, arrive: clock, depart: clock + dwell });
    const next = i + 1 < points.length ? points[i + 1].at : loopLength;
    // Kecepatan jelajah antar titik henti: 21–31 km/jam.
    clock += dwell + (next - point.at) / (5.8 + random() * 2.8);
  });

  return {
    id: raw.id,
    name: raw.name,
    corridor: raw.corridor,
    color: raw.color,
    directions,
    loopPath: [...out.path, ...back.path],
    loopLength,
    cycle: clock,
    events,
  };
}

export const BUS_ROUTES: BusRoute[] = routeData.routes.map(buildRoute);
export const BUS_DATA_SOURCE: string = routeData.source;

export const BUSES: Bus[] = BUS_ROUTES.flatMap((route) => {
  const count = BUSES_PER_ROUTE[route.id] ?? 3;
  return Array.from({ length: count }, (_, i) => ({ route, i, count }));
}).map(({ route, i, count }, index) => {
  const id = `${route.id}-${i + 1}`;
  const random = mulberry32(fnv1a(`suroboyo-bus:${id}`));
  return {
    id,
    code: `SB-${String(index + 1).padStart(2, "0")}`,
    route,
    offset: (route.cycle * i) / count,
    // Dua gelombang lambat; turunannya < 1 supaya bus tidak pernah mundur.
    delay: {
      base: 5 + random() * 50,
      a1: 35 + random() * 35,
      p1: 1800 + random() * 1200,
      f1: random() * Math.PI * 2,
      a2: 15 + random() * 20,
      p2: 900 + random() * 600,
      f2: random() * Math.PI * 2,
    },
  };
});

const BUS_BY_ID = new Map(BUSES.map((bus) => [bus.id, bus]));
export const getBus = (id: string) => BUS_BY_ID.get(id);
export const getBusRoute = (id: string) => BUS_ROUTES.find((r) => r.id === id);

// ─── Posisi terhadap waktu ──────────────────────────────────────────────────
function delayAt(bus: Bus, tSec: number): number {
  const { base, a1, p1, f1, a2, p2, f2 } = bus.delay;
  return Math.max(
    -20,
    base +
      a1 * Math.sin((2 * Math.PI * tSec) / p1 + f1) +
      a2 * Math.sin((2 * Math.PI * tSec) / p2 + f2),
  );
}
/** Waktu jadwal yang sedang dijalani bus (detik, terus naik). */
function scheduleTime(bus: Bus, tSec: number): number {
  return tSec - delayAt(bus, tSec) + bus.offset;
}
const wrap = (value: number, period: number) =>
  ((value % period) + period) % period;

/** Indeks titik henti terakhir yang sudah dicapai pada fase putaran `phase`. */
function eventIndexAt(route: BusRoute, phase: number): number {
  const { events } = route;
  let lo = 0;
  let hi = events.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (events[mid].arrive <= phase) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Jarak pada putaran (m) untuk fase putaran `phase` (detik). */
function distanceAt(route: BusRoute, phase: number): number {
  const { events, cycle, loopLength } = route;
  const i = eventIndexAt(route, phase);
  const event = events[i];
  if (phase <= event.depart) return event.at;
  const nextAt = i + 1 < events.length ? events[i + 1].at : loopLength;
  const nextArrive = i + 1 < events.length ? events[i + 1].arrive : cycle;
  const u = (phase - event.depart) / (nextArrive - event.depart);
  // Melambat menjelang titik henti dan berakselerasi setelahnya.
  const eased = u + 0.5 * (u * u * (3 - 2 * u) - u);
  return event.at + (nextAt - event.at) * eased;
}

export function busSnapshot(bus: Bus, nowMs: number): BusSnapshot {
  const { route } = bus;
  const tSec = nowMs / 1000;
  const delaySec = delayAt(bus, tSec);
  const phase = wrap(scheduleTime(bus, tSec), route.cycle);
  const event = route.events[eventIndexAt(route, phase)];
  const distance = distanceAt(route, phase);
  const stopped = phase <= event.depart;
  const ahead = distanceAt(route, wrap(phase + 1, route.cycle));
  return {
    bus,
    progress: distance / route.loopLength,
    direction: route.directions[event.direction],
    delaySec,
    late: delaySec > LATE_THRESHOLD_SEC,
    dwellingAt: stopped && event.kind === "stop" ? event.name : null,
    moving: !stopped,
    speedKmh: stopped ? 0 : Math.max(0, wrap(ahead - distance, route.loopLength)) * 3.6,
  };
}

/** Saat (ms) bus mencapai waktu jadwal `target`, dicari di antara `fromMs` dan `toMs`. */
function timeAtSchedule(bus: Bus, target: number, fromMs: number, toMs: number): number {
  let lo = fromMs / 1000;
  let hi = toMs / 1000;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (scheduleTime(bus, mid) < target) lo = mid;
    else hi = mid;
  }
  return hi * 1000;
}

/** Titik henti berikutnya di depan bus beserta perkiraan waktu tibanya. */
export function upcomingArrivals(
  bus: Bus,
  nowMs: number,
  count: number,
  kind?: RouteEvent["kind"],
): Arrival[] {
  const { route } = bus;
  const schedule = scheduleTime(bus, nowMs / 1000);
  const phase = wrap(schedule, route.cycle);
  const start = eventIndexAt(route, phase);
  const arrivals: Arrival[] = [];
  for (let step = 1; step <= route.events.length && arrivals.length < count; step++) {
    const eventIndex = (start + step) % route.events.length;
    const event = route.events[eventIndex];
    if (kind && event.kind !== kind) continue;
    const ahead = wrap(event.arrive - phase, route.cycle);
    const at = timeAtSchedule(bus, schedule + ahead, nowMs, nowMs + ahead * 4000 + 60000);
    arrivals.push({ event, eventIndex, etaSec: (at - nowMs) / 1000 });
  }
  return arrivals;
}

const extendFor = (delaySec: number) =>
  delaySec > LATE_THRESHOLD_SEC
    ? Math.max(5, Math.min(15, Math.round(delaySec / 12)))
    : 0;
const signalKey = (route: BusRoute, eventIndex: number) =>
  `${route.id}:${eventIndex}`;

/** Simpang yang fase hijaunya sedang diperpanjang untuk bus yang terlambat. */
export function activeSignalAdjustments(nowMs: number): SignalAdjustment[] {
  const bySignal = new Map<string, SignalAdjustment>();
  for (const bus of BUSES) {
    const delaySec = delayAt(bus, nowMs / 1000);
    if (delaySec <= LATE_THRESHOLD_SEC) continue;
    const [next] = upcomingArrivals(bus, nowMs, 1, "signal");
    if (!next || next.etaSec > PRIORITY_HORIZON_SEC) continue;
    const key = signalKey(bus.route, next.eventIndex);
    const current = bySignal.get(key);
    if (current && current.etaSec <= next.etaSec) continue;
    bySignal.set(key, {
      key,
      routeId: bus.route.id,
      name: next.event.name,
      lngLat: next.event.lngLat,
      busCode: bus.code,
      etaSec: next.etaSec,
      extendSec: extendFor(delaySec),
    });
  }
  return [...bySignal.values()].sort((a, b) => a.etaSec - b.etaSec);
}

/**
 * Riwayat keputusan prioritas sinyal: tiap kali bus yang tertinggal jadwal
 * melewati simpang, fase hijau diperpanjang (terlambat) atau dibiarkan normal.
 */
export function signalAdjustmentLog(
  nowMs: number,
  windowMs: number,
  limit: number,
): AdjustmentLogEntry[] {
  const fromMs = nowMs - windowMs;
  const entries: AdjustmentLogEntry[] = [];
  for (const bus of BUSES) {
    const { route } = bus;
    const from = scheduleTime(bus, fromMs / 1000);
    const to = scheduleTime(bus, nowMs / 1000);
    route.events.forEach((event, eventIndex) => {
      if (event.kind !== "signal") return;
      // Tiap lintasan simpang ini dalam jendela waktu (bisa lebih dari satu putaran).
      const firstLap = Math.ceil((from - event.arrive) / route.cycle);
      for (let lap = firstLap; event.arrive + lap * route.cycle <= to; lap++) {
        const timeMs = timeAtSchedule(bus, event.arrive + lap * route.cycle, fromMs, nowMs);
        const delaySec = delayAt(bus, timeMs / 1000);
        if (delaySec <= PRIORITY_WATCH_SEC) continue;
        entries.push({
          key: `${bus.id}:${eventIndex}:${lap}`,
          timeMs,
          name: event.name,
          routeId: route.id,
          busCode: bus.code,
          extendSec: extendFor(delaySec),
        });
      }
    });
  }
  return entries.sort((a, b) => b.timeMs - a.timeMs).slice(0, limit);
}

// ─── Halte (digabung lintas koridor) ────────────────────────────────────────
export interface BusStopGroup {
  key: string;
  name: string;
  lngLat: LngLat;
  routeIds: string[];
  /** Titik henti koridor yang berada di halte ini. */
  refs: { route: BusRoute; eventIndex: number }[];
}

export const BUS_STOP_GROUPS: BusStopGroup[] = (() => {
  const groups = new Map<string, BusStopGroup>();
  for (const route of BUS_ROUTES) {
    route.events.forEach((event, eventIndex) => {
      if (event.kind !== "stop") return;
      // Halte yang sama dipakai beberapa koridor: nama sama, posisi berimpit (~30 m).
      const key = `${event.name}@${event.lngLat[0].toFixed(3)},${event.lngLat[1].toFixed(3)}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, name: event.name, lngLat: event.lngLat, routeIds: [], refs: [] };
        groups.set(key, group);
      }
      if (!group.routeIds.includes(route.id)) group.routeIds.push(route.id);
      group.refs.push({ route, eventIndex });
    });
  }
  return [...groups.values()];
})();

const STOP_GROUP_BY_KEY = new Map(BUS_STOP_GROUPS.map((g) => [g.key, g]));
export const getBusStopGroup = (key: string) => STOP_GROUP_BY_KEY.get(key);

export interface StopArrival {
  bus: Bus;
  /** Tujuan akhir arah yang sedang dijalani bus saat tiba di halte ini. */
  to: string;
  etaSec: number;
  late: boolean;
}

/** Kedatangan berikutnya di sebuah halte, dari semua koridor yang melewatinya. */
export function stopArrivals(
  group: BusStopGroup,
  nowMs: number,
  count: number,
): StopArrival[] {
  const arrivals: StopArrival[] = [];
  for (const { route, eventIndex } of group.refs) {
    const event = route.events[eventIndex];
    for (const bus of BUSES) {
      if (bus.route !== route) continue;
      const schedule = scheduleTime(bus, nowMs / 1000);
      const ahead = wrap(event.arrive - schedule, route.cycle);
      const at = timeAtSchedule(bus, schedule + ahead, nowMs, nowMs + ahead * 4000 + 60000);
      arrivals.push({
        bus,
        to: route.directions[event.direction].to,
        etaSec: (at - nowMs) / 1000,
        late: delayAt(bus, nowMs / 1000) > LATE_THRESHOLD_SEC,
      });
    }
  }
  return arrivals.sort((a, b) => a.etaSec - b.etaSec).slice(0, count);
}

// ─── Format tampilan ────────────────────────────────────────────────────────
/** "Tiba", "45 dtk", "3 mnt", "1 j 05 mnt". */
export function formatEta(etaSec: number): string {
  if (etaSec < 10) return "Tiba";
  if (etaSec < 60) return `${Math.round(etaSec / 5) * 5} dtk`;
  const minutes = Math.round(etaSec / 60);
  if (minutes < 60) return `${minutes} mnt`;
  return `${Math.floor(minutes / 60)} j ${String(minutes % 60).padStart(2, "0")} mnt`;
}

/** "Tepat waktu" atau "Telat 90 dtk" (dibulatkan supaya tidak berkedip tiap detik). */
export function formatAdherence(delaySec: number): string {
  if (delaySec <= LATE_THRESHOLD_SEC) return "Tepat waktu";
  const rounded = Math.round(delaySec / 10) * 10;
  return rounded < 120
    ? `Telat ${rounded} dtk`
    : `Telat ${(rounded / 60).toFixed(1).replace(".", ",")} mnt`;
}
