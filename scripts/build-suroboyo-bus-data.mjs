// Membangun lib/data/suroboyoBusRoutes.json dari data OpenStreetMap (Overpass):
// geometri koridor Suroboyo Bus, halte di sepanjang koridor, dan simpang
// bersinyal yang dilewati. Jalankan ulang bila data OSM berubah:
//
//   node scripts/build-suroboyo-bus-data.mjs
//
// Set SBUS_CACHE_DIR=<folder> untuk menyimpan/memakai ulang respons Overpass.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OUT_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../lib/data/suroboyoBusRoutes.json",
);

// Relasi rute OSM (network "Bus Suroboyo"): [arah berangkat, arah pulang].
// Rute 3 (bus tingkat) tidak dipakai karena hampir seluruhnya berimpit dengan R1.
const ROUTES = [
  {
    id: "R1",
    name: "Purabaya – Rajawali",
    corridor: "Koridor Utara–Selatan",
    color: "#1d4ed8",
    relations: [9788759, 9788760],
    terminals: ["Terminal Purabaya", "Rajawali"],
  },
  {
    id: "R2",
    name: "ITS – Unesa",
    corridor: "Koridor Timur–Barat",
    color: "#0f9488",
    relations: [9788971, 9788972],
    terminals: ["ITS", "Unesa"],
  },
  {
    id: "R4",
    name: "Gunung Anyar – Kenjeran",
    corridor: "Koridor MERR",
    color: "#9a5b13",
    relations: [9969904, 9969905],
    terminals: ["MERR Gunung Anyar", "Kenjeran"],
  },
  {
    id: "R5",
    name: "Jono Soewojo – Joyoboyo",
    corridor: "Koridor Barat",
    color: "#334155",
    relations: [13130304, 13130305],
    terminals: ["Jono Soewojo", "Terminal Intermoda Joyoboyo"],
  },
];

/** Jarak maksimum halte dari sumbu jalan rute (m). */
const STOP_MAX_OFFSET = 35;
/** Halte yang lebih rapat dari ini di satu arah dianggap halte yang sama (m). */
const STOP_MIN_SPACING = 120;
/** Lampu sinyal yang lebih rapat dari ini dianggap satu simpang (m). */
const SIGNAL_CLUSTER = 110;

// ─── Overpass ───────────────────────────────────────────────────────────────
async function overpass(name, query) {
  const cacheDir = process.env.SBUS_CACHE_DIR;
  const cacheFile = cacheDir && join(cacheDir, `${name}.json`);
  if (cacheFile && existsSync(cacheFile))
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "sparta-ephor/0.1 (suroboyo bus route data)",
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (response.ok) {
      const text = await response.text();
      if (cacheFile) writeFileSync(cacheFile, text);
      return JSON.parse(text);
    }
    if (attempt === 4) throw new Error(`Overpass ${name}: ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
  }
}

// ─── Geometri (meter lokal di sekitar Surabaya) ─────────────────────────────
const LAT0 = -7.28;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const toXY = ([lng, lat]) => [lng * M_PER_DEG_LNG, lat * M_PER_DEG_LAT];
const dist = (a, b) => {
  const [ax, ay] = toXY(a);
  const [bx, by] = toXY(b);
  return Math.hypot(bx - ax, by - ay);
};

/** Titik terdekat pada polyline: jarak sepanjang rute, jarak tegak lurus, dan sisi jalan. */
function project(path, cum, point) {
  const [px, py] = toXY(point);
  let best = { at: 0, offset: Infinity, left: false, lngLat: path[0] };
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = toXY(path[i]);
    const [bx, by] = toXY(path[i + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) continue;
    const t = Math.max(
      0,
      Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq),
    );
    const offset = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    if (offset < best.offset) {
      best = {
        at: cum[i] + Math.sqrt(lengthSq) * t,
        offset,
        // Lalu lintas Indonesia di lajur kiri, jadi halte ada di kiri arah jalan.
        left: dx * (py - ay) - dy * (px - ax) > 0,
        lngLat: [
          path[i][0] + (path[i + 1][0] - path[i][0]) * t,
          path[i][1] + (path[i + 1][1] - path[i][1]) * t,
        ],
      };
    }
  }
  return best;
}

/** Menyambung way anggota relasi (sudah berurutan) menjadi satu polyline. */
function chainWays(relation) {
  const ways = relation.members.filter((m) => m.type === "way" && m.geometry);
  let path = [];
  ways.forEach((way, i) => {
    let points = way.geometry.map((p) => [p.lon, p.lat]);
    if (path.length === 0) {
      const next = ways[i + 1]?.geometry.map((p) => [p.lon, p.lat]);
      if (next) {
        const gapFrom = (p) =>
          Math.min(dist(p, next[0]), dist(p, next[next.length - 1]));
        if (gapFrom(points[0]) < gapFrom(points[points.length - 1]))
          points.reverse();
      }
      path = points;
      return;
    }
    const last = path[path.length - 1];
    if (dist(last, points[points.length - 1]) < dist(last, points[0]))
      points.reverse();
    path.push(...points.slice(dist(last, points[0]) < 1 ? 1 : 0));
  });
  return path;
}

const round = (n, digits) => Number(n.toFixed(digits));
// Nama jalan resmi di OSM dipendekkan ke sebutan sehari-harinya.
const STREET_ALIASES = [
  [/^Jalan\s+/i, ""],
  [/Doktor Insinyur Haji Soekarno/i, "MERR"],
  [/Jenderal Ac?hmad Yani( Frontage \w+)?/i, "Ahmad Yani"],
  [/Mayor Jenderal Sungkono|Mayjend Sungkono/i, "Mayjen Sungkono"],
  [/Jenderal Urip Sumoharjo/i, "Urip Sumoharjo"],
  [/HR\. Muhammad/i, "HR Muhammad"],
];
const cleanStreet = (name) =>
  STREET_ALIASES.reduce((text, [from, to]) => text.replace(from, to), name).trim();

/**
 * Nama simpang: jalan yang memotong bila tercatat di OSM; bila tidak (atau
 * namanya kembar di arah yang sama), jalan rute + halte terdekat.
 */
function nameSignals(signals, stops) {
  const crossCount = new Map();
  for (const s of signals)
    if (s.cross) crossCount.set(s.cross, (crossCount.get(s.cross) ?? 0) + 1);
  return signals.map(({ street, cross, ...s }) => {
    if (cross && crossCount.get(cross) === 1)
      return { name: `Simpang ${cleanStreet(cross)}`, ...s };
    const nearest = stops.reduce((a, b) =>
      Math.abs(b.at - s.at) < Math.abs(a.at - s.at) ? b : a,
    );
    const road = cleanStreet(cross ?? street ?? "");
    return { name: `Simpang ${road ? `${road} · ` : ""}${nearest.name}`, ...s };
  });
}

// ─── Bangun data ────────────────────────────────────────────────────────────
const relationIds = ROUTES.flatMap((r) => r.relations).join(",");
const relData = await overpass(
  "relations",
  `[out:json][timeout:90];relation(id:${relationIds})->.r;.r out geom;node(r.r);out body;`,
);
const extraData = await overpass(
  "extras",
  `[out:json][timeout:120];relation(id:${relationIds})->.r;way(r.r)->.w;` +
    `node(around.w:45)["highway"="bus_stop"]->.s;node(w.w)["highway"="traffic_signals"]->.t;` +
    `.s out body;.t out body;way(bn.t)["highway"];out body;`,
);

const relations = new Map(
  relData.elements.filter((e) => e.type === "relation").map((e) => [e.id, e]),
);
const memberNodes = new Map(
  relData.elements.filter((e) => e.type === "node").map((e) => [e.id, e]),
);
const busStops = extraData.elements.filter(
  (e) => e.type === "node" && e.tags?.highway === "bus_stop" && e.tags.name,
);
const signalNodes = extraData.elements.filter(
  (e) => e.type === "node" && e.tags?.highway === "traffic_signals",
);
// Nama jalan yang melewati tiap node sinyal.
const streetsAtNode = new Map();
for (const way of extraData.elements) {
  if (way.type !== "way" || !way.nodes || !way.tags?.name) continue;
  for (const nodeId of way.nodes) {
    if (!streetsAtNode.has(nodeId)) streetsAtNode.set(nodeId, []);
    streetsAtNode.get(nodeId).push({ id: way.id, name: way.tags.name });
  }
}

function buildDirection(route, index) {
  const relation = relations.get(route.relations[index]);
  const other = relations.get(route.relations[1 - index]);
  const path = chainWays(relation);
  const otherPath = chainWays(other);
  const cumOf = (line) => {
    const cum = [0];
    for (let i = 1; i < line.length; i++)
      cum.push(cum[i - 1] + dist(line[i - 1], line[i]));
    return cum;
  };
  const cum = cumOf(path);
  const otherCum = cumOf(otherPath);
  const length = cum[cum.length - 1];
  const routeWayIds = new Set(
    relation.members.filter((m) => m.type === "way").map((m) => m.ref),
  );

  // Halte: anggota relasi bila lengkap (R1), selain itu halte OSM di kiri jalan.
  const platforms = relation.members
    .filter((m) => m.type === "node")
    .map((m) => memberNodes.get(m.ref))
    .filter((n) => n?.tags?.name);
  const candidates =
    platforms.length >= 10
      ? platforms.map((n) => ({ node: n, ...project(path, cum, [n.lon, n.lat]) }))
      : busStops
          .map((n) => ({
            node: n,
            ...project(path, cum, [n.lon, n.lat]),
            otherOffset: project(otherPath, otherCum, [n.lon, n.lat]).offset,
          }))
          .filter(
            (c) =>
              c.offset <= STOP_MAX_OFFSET &&
              c.left &&
              c.offset <= c.otherOffset + 4,
          );
  candidates.sort((a, b) => a.at - b.at);
  const stops = [];
  for (const c of candidates) {
    const previous = stops[stops.length - 1];
    if (previous && c.at - previous.at < STOP_MIN_SPACING) continue;
    stops.push({
      name: c.node.tags.name.replace(/^Halte\s+/i, ""),
      at: round(c.at, 1),
      lngLat: c.lngLat.map((v) => round(v, 6)),
    });
  }
  // Terminal di kedua ujung selalu jadi halte pertama dan terakhir.
  const [startName, endName] =
    index === 0 ? route.terminals : [...route.terminals].reverse();
  const terminal = (name, at, lngLat) => ({
    name,
    at: round(at, 1),
    lngLat: lngLat.map((v) => round(v, 6)),
  });
  if (!stops.length || stops[0].at > 200)
    stops.unshift(terminal(startName, 0, path[0]));
  else Object.assign(stops[0], { name: startName, at: 0 });
  const lastStop = stops[stops.length - 1];
  if (length - lastStop.at > 200)
    stops.push(terminal(endName, length, path[path.length - 1]));
  else Object.assign(lastStop, { name: endName, at: round(length, 1) });

  // Simpang bersinyal: node sinyal pada way rute, digabung per simpang.
  const onPath = signalNodes
    .map((n) => ({ node: n, ...project(path, cum, [n.lon, n.lat]) }))
    .filter((s) => s.offset < 2.5)
    .sort((a, b) => a.at - b.at);
  const signals = [];
  for (const s of onPath) {
    const streets = streetsAtNode.get(s.node.id) ?? [];
    const routeStreet = streets.find((w) => routeWayIds.has(w.id))?.name;
    const cross = streets.find(
      (w) => !routeWayIds.has(w.id) && w.name !== routeStreet,
    )?.name;
    const previous = signals[signals.length - 1];
    if (previous && s.at - previous.at < SIGNAL_CLUSTER) {
      previous.cross ??= cross;
      continue;
    }
    signals.push({
      at: round(s.at, 1),
      lngLat: s.lngLat.map((v) => round(v, 6)),
      street: routeStreet,
      cross,
    });
  }

  return {
    id: `${route.id}-${index === 0 ? "A" : "B"}`,
    from: startName,
    to: endName,
    length: round(length, 1),
    path: path.map((p) => p.map((v) => round(v, 6))),
    stops,
    signals: nameSignals(
      signals.filter((s) => s.at > 60 && length - s.at > 60),
      stops,
    ),
  };
}

const output = {
  source:
    "© OpenStreetMap contributors (ODbL) — relasi rute network \"Bus Suroboyo\"",
  routes: ROUTES.map((route) => ({
    id: route.id,
    name: route.name,
    corridor: route.corridor,
    color: route.color,
    directions: [buildDirection(route, 0), buildDirection(route, 1)],
  })),
};

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(output));
for (const route of output.routes) {
  for (const d of route.directions) {
    console.log(
      `${d.id} ${d.from} → ${d.to}: ${(d.length / 1000).toFixed(1)} km, ` +
        `${d.path.length} titik, ${d.stops.length} halte, ${d.signals.length} simpang`,
    );
    if (process.env.SBUS_VERBOSE) {
      console.log("  halte  :", d.stops.map((s) => s.name).join(" › "));
      console.log("  simpang:", d.signals.map((s) => s.name).join(" › "));
    }
  }
}
