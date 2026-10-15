// Layer kustom MapLibre yang menggambar marker 3D (three.js) langsung di kanvas
// peta: lampu lalu lintas di tiap persimpangan, ambulans yang melaju di
// sepanjang rutenya, dan armada Suroboyo Bus di koridornya. Model berbagi
// konteks WebGL dengan peta, jadi ikut miring dan berputar bersama kamera peta.
import {
  Camera,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreMap,
} from "maplibre-gl";
import {
  AMBULANCE_TOP,
  AmbulanceModel,
  BUS_TOP,
  BusModel,
  ModelKit,
  SIGNAL_RADIUS,
  SIGNAL_TOP,
  SignalModel,
  type LampColor,
} from "./models";

export interface ModelNode {
  id: string;
  lng: number;
  lat: number;
  /** Warna status kemacetan (alas + halo). */
  color: string;
  /** Lampu yang menyala. */
  lamp: LampColor;
  kritis: boolean;
  percent: number;
  selected: boolean;
}
export interface ModelVehicle {
  id: string;
  /** Rute sebagai [lng, lat]; posisi kendaraan = `progress` dari panjang rute. */
  path: [number, number][];
  progress: number;
  greenWaveOn: boolean;
}
export interface VehicleState {
  /** Progres yang sedang ditampilkan (sudah dihaluskan antar polling). */
  progress: number;
  lngLat: [number, number];
  /** Indeks titik rute terakhir yang sudah dilewati. */
  segment: number;
  /** Tinggi model di layar (px), untuk offset popup. */
  screenHeight: number;
}
export interface ModelBus {
  id: string;
  /** Kode lambung pada label, mis. "SB-07". */
  code: string;
  routeId: string;
  /** Warna koridor (lingkar di bawah bus). */
  color: string;
  /** Putaran koridor sebagai [lng, lat]. */
  path: [number, number][];
}
export interface BusSample {
  /** Posisi pada putaran koridor, 0..1. */
  progress: number;
  late: boolean;
  moving: boolean;
}
export interface BusState {
  lngLat: [number, number];
  /** Tinggi model + label di layar (px), untuk offset popup. */
  screenHeight: number;
}
export interface ModelHit {
  kind: "node" | "vehicle" | "bus";
  id: string;
}

// Titik acuan scene. Posisi model disimpan dalam meter relatif titik ini supaya
// presisi float32 di GPU tetap cukup.
const SCENE_ORIGIN: [number, number] = [112.74, -7.28];

// Ukuran model di layar (px) per zoom, seperti ikon: [zoom, px].
const NODE_PX: [number, number][] = [
  [8, 20],
  [12, 34],
  [15, 44],
  [17, 52],
];
// Lebar badge persen kritis (px); tidak ikut mengecil bersama modelnya.
const BADGE_PX: [number, number][] = [
  [8, 22],
  [12, 32],
  [15, 38],
  [17, 42],
];
const VEHICLE_PX: [number, number][] = [
  [8, 20],
  [12, 32],
  [15, 42],
  [17, 52],
];
const BUS_PX: [number, number][] = [
  [8, 14],
  [12, 28],
  [15, 44],
  [17, 60],
];
// Lebar label kode bus (px); di bawah zoom pertama label disembunyikan.
const BUS_LABEL_PX: [number, number][] = [
  [11, 0],
  [11.5, 30],
  [15, 40],
  [17, 46],
];
/** Panjang asli bus (meter): saat zoom sangat dekat bus tampil seukuran aslinya. */
const BUS_MIN_METERS = 12;
// Di bawah zoom ini bus hanya bergeser sepersekian piksel per frame, jadi peta
// cukup digambar ulang tiap selang ini (ms) alih-alih tiap frame.
const BUS_SMOOTH_ZOOM = 14.5;
const BUS_IDLE_FRAME_MS = 90;
/** Radius minimum area klik ambulans (px). */
const VEHICLE_MIN_HIT_PX = 16;
// Saat zoom sangat dekat model tidak lebih kecil dari ukuran aslinya (meter).
const NODE_MIN_METERS = 7;
const VEHICLE_MIN_METERS = 6;
const SELECTED_GROW = 1.3;
/** Elevasi terrain dibaca ulang tiap selang ini (ms), bukan tiap frame. */
const ELEVATION_REFRESH_MS = 400;
const DEG = Math.PI / 180;

function sizeAtZoom(stops: [number, number][], zoom: number): number {
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [z1, v1] = stops[i];
    if (zoom <= z1) {
      const [z0, v0] = stops[i - 1];
      return v0 + ((v1 - v0) * (zoom - z0)) / (z1 - z0);
    }
  }
  return stops[stops.length - 1][1];
}

interface ScreenPoint {
  x: number;
  y: number;
  w: number;
}

interface NodeRec {
  model: SignalModel;
  lng: number;
  lat: number;
  x: number;
  y: number;
  z: number;
  selected: boolean;
  /** Faktor skala pin terpilih, dianimasikan menuju 1 atau SELECTED_GROW. */
  grow: number;
  onScreen: boolean;
  baseX: number;
  baseY: number;
  topX: number;
  topY: number;
  headY: number;
  radius: number;
}

/** Kendaraan yang melaju di sepanjang sebuah rute. */
interface PathRec {
  lngLat: [number, number][];
  /** Titik rute dalam meter lokal [x0, y0, x1, y1, ...] dan jarak kumulatifnya. */
  xy: Float64Array;
  cum: Float64Array;
  /** Posisi yang sedang ditampilkan, 0..1 dari panjang rute. */
  shown: number;
  heading: number | null;
  segment: number;
  lng: number;
  lat: number;
  x: number;
  y: number;
  z: number;
  onScreen: boolean;
  centerX: number;
  centerY: number;
  radius: number;
  height: number;
}

interface VehicleRec extends PathRec {
  model: AmbulanceModel;
  target: number;
  /** Laju progres per detik menuju `target`. */
  rate: number;
  updatedAt: number;
}

interface BusRec extends PathRec {
  model: BusModel;
  routeId: string;
}

export class MapModelLayer implements CustomLayerInterface {
  readonly id = "sparta-3d-models";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private map: MapLibreMap | null = null;
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera = new Camera();
  private kit = new ModelKit();
  private nodeGroup = new Group();
  private vehicleGroup = new Group();
  private busGroup = new Group();
  private nodes = new Map<string, NodeRec>();
  private vehicles = new Map<string, VehicleRec>();
  private buses = new Map<string, BusRec>();
  private sampleBus: ((id: string, nowMs: number) => BusSample) | null = null;
  private busRouteFilter: string | null = null;
  private busTimer: ReturnType<typeof setTimeout> | null = null;

  private originMerc = MercatorCoordinate.fromLngLat(SCENE_ORIGIN, 0);
  private unit = this.originMerc.meterInMercatorCoordinateUnits();
  // Meter lokal (timur, utara, atas) -> koordinat mercator.
  private sceneMatrix = new Matrix4()
    .makeTranslation(this.originMerc.x, this.originMerc.y, this.originMerc.z)
    .scale(new Vector3(this.unit, -this.unit, this.unit));
  private viewProj = new Matrix4();
  private basis = new Matrix4();
  private billboard = new Quaternion();
  private right = new Vector3();
  private up = new Vector3();
  private normal = new Vector3();
  private p0: ScreenPoint = { x: 0, y: 0, w: 0 };
  private p1: ScreenPoint = { x: 0, y: 0, w: 0 };

  private width = 1;
  private height = 1;
  private centerZ = 0;
  private lastFrame = 0;
  private elevatedAt = 0;

  constructor() {
    this.nodeGroup.visible = false;
    this.busGroup.visible = false;
    this.scene.add(this.nodeGroup, this.busGroup, this.vehicleGroup);
    const sky = new HemisphereLight("#ffffff", "#aab4c3", 2.1);
    sky.position.set(0, 0, 1);
    const sun = new DirectionalLight("#ffffff", 1.6);
    sun.position.set(-0.45, -0.7, 1);
    this.scene.add(sky, sun);
  }

  // ─── Siklus hidup layer ───────────────────────────────────────────────────
  onAdd(map: MapLibreMap) {
    this.map = map;
    this.measure();
    map.on("resize", this.measure);
  }

  onRemove() {
    this.dispose();
  }

  dispose() {
    this.map?.off("resize", this.measure);
    this.map = null;
    if (this.busTimer !== null) clearTimeout(this.busTimer);
    this.busTimer = null;
    this.nodes.forEach((rec) => rec.model.dispose());
    this.vehicles.forEach((rec) => rec.model.dispose());
    this.buses.forEach((rec) => rec.model.dispose());
    this.nodes.clear();
    this.vehicles.clear();
    this.buses.clear();
    this.nodeGroup.clear();
    this.vehicleGroup.clear();
    this.busGroup.clear();
    this.kit.dispose();
    this.renderer?.dispose();
    this.renderer = null;
  }

  private measure = () => {
    const canvas = this.map?.getCanvas();
    if (!canvas) return;
    this.width = canvas.clientWidth || 1;
    this.height = canvas.clientHeight || 1;
  };

  // ─── Data ─────────────────────────────────────────────────────────────────
  get nodesVisible() {
    return this.nodeGroup.visible;
  }
  setNodesVisible(visible: boolean) {
    this.nodeGroup.visible = visible;
    this.map?.triggerRepaint();
  }
  setVehiclesVisible(visible: boolean) {
    this.vehicleGroup.visible = visible;
    this.map?.triggerRepaint();
  }

  setNodes(list: ModelNode[]) {
    const seen = new Set<string>();
    for (const n of list) {
      seen.add(n.id);
      let rec = this.nodes.get(n.id);
      if (!rec) {
        const model = new SignalModel(this.kit);
        this.nodeGroup.add(model.root);
        rec = {
          model,
          lng: n.lng,
          lat: n.lat,
          x: 0,
          y: 0,
          z: 0,
          selected: n.selected,
          grow: n.selected ? SELECTED_GROW : 1,
          onScreen: false,
          baseX: 0,
          baseY: 0,
          topX: 0,
          topY: 0,
          headY: 0,
          radius: 0,
        };
        this.nodes.set(n.id, rec);
      }
      rec.lng = n.lng;
      rec.lat = n.lat;
      [rec.x, rec.y] = this.toLocal(n.lng, n.lat);
      rec.selected = n.selected;
      rec.model.setStatus(n.color, n.lamp);
      rec.model.setKritis(n.kritis, n.percent);
    }
    this.nodes.forEach((rec, id) => {
      if (seen.has(id)) return;
      this.nodeGroup.remove(rec.model.root);
      rec.model.dispose();
      this.nodes.delete(id);
    });
    this.elevatedAt = 0;
    this.map?.triggerRepaint();
  }

  setVehicles(list: ModelVehicle[]) {
    const now = performance.now();
    const seen = new Set<string>();
    for (const v of list) {
      if (v.path.length === 0) continue;
      seen.add(v.id);
      const progress = Math.max(0, Math.min(1, v.progress));
      let rec = this.vehicles.get(v.id);
      if (!rec) {
        const model = new AmbulanceModel(this.kit);
        this.vehicleGroup.add(model.root);
        rec = {
          model,
          lngLat: v.path,
          xy: new Float64Array(0),
          cum: new Float64Array(0),
          shown: progress,
          target: progress,
          rate: 0,
          updatedAt: now,
          heading: null,
          segment: 0,
          lng: v.path[0][0],
          lat: v.path[0][1],
          x: 0,
          y: 0,
          z: 0,
          onScreen: false,
          centerX: 0,
          centerY: 0,
          radius: 0,
          height: 0,
        };
        this.vehicles.set(v.id, rec);
      } else if (progress !== rec.target) {
        // Progres baru dari server dicapai tepat saat polling berikutnya tiba,
        // sehingga kendaraan melaju mulus alih-alih melompat tiap polling.
        const interval = Math.max(1, Math.min(10, (now - rec.updatedAt) / 1000));
        if (progress > rec.shown) {
          rec.rate = (progress - rec.shown) / interval;
        } else {
          rec.shown = progress;
          rec.rate = 0;
        }
        rec.target = progress;
        rec.updatedAt = now;
      }
      this.setPath(rec, v.path);
      rec.model.setGreenWave(v.greenWaveOn);
      this.placeOnPath(rec);
    }
    this.vehicles.forEach((rec, id) => {
      if (seen.has(id)) return;
      this.vehicleGroup.remove(rec.model.root);
      rec.model.dispose();
      this.vehicles.delete(id);
    });
    this.elevatedAt = 0;
    this.map?.triggerRepaint();
  }

  /**
   * Armada bus. Posisinya tidak dikirim lewat polling: `sample` dipanggil tiap
   * frame dengan waktu saat itu, jadi bus melaju mulus tanpa interpolasi.
   */
  setBuses(list: ModelBus[], sample: (id: string, nowMs: number) => BusSample) {
    this.sampleBus = sample;
    this.buses.forEach((rec) => rec.model.dispose());
    this.buses.clear();
    this.busGroup.clear();
    for (const bus of list) {
      if (bus.path.length < 2) continue;
      const model = new BusModel(this.kit, bus.code, bus.color);
      this.busGroup.add(model.root);
      const rec: BusRec = {
        model,
        routeId: bus.routeId,
        lngLat: bus.path,
        xy: new Float64Array(0),
        cum: new Float64Array(0),
        shown: 0,
        heading: null,
        segment: 0,
        lng: bus.path[0][0],
        lat: bus.path[0][1],
        x: 0,
        y: 0,
        z: 0,
        onScreen: false,
        centerX: 0,
        centerY: 0,
        radius: 0,
        height: 0,
      };
      this.setPath(rec, bus.path);
      this.buses.set(bus.id, rec);
    }
    this.elevatedAt = 0;
    this.map?.triggerRepaint();
  }
  setBusesVisible(visible: boolean) {
    this.busGroup.visible = visible;
    this.map?.triggerRepaint();
  }
  /** Hanya tampilkan bus koridor ini (null = semua koridor). */
  setBusRouteFilter(routeId: string | null) {
    this.busRouteFilter = routeId;
    this.map?.triggerRepaint();
  }

  /** Posisi bus saat ini (dihitung ulang, jadi tetap benar saat layer tersembunyi). */
  getBusState(id: string): BusState | null {
    const rec = this.buses.get(id);
    if (!rec || !this.sampleBus) return null;
    rec.shown = this.sampleBus(id, Date.now()).progress;
    this.placeOnPath(rec);
    return { lngLat: [rec.lng, rec.lat], screenHeight: rec.height };
  }

  getVehicleState(id: string): VehicleState | null {
    const rec = this.vehicles.get(id);
    if (!rec) return null;
    return {
      progress: rec.shown,
      lngLat: [rec.lng, rec.lat],
      segment: rec.segment,
      screenHeight: rec.height,
    };
  }

  /** Tinggi marker persimpangan di layar (px), termasuk badge kritis. */
  getNodeScreenHeight(id: string): number | null {
    const rec = this.nodes.get(id);
    if (!rec || !rec.onScreen) return null;
    return Math.max(0, rec.baseY - rec.headY);
  }

  /** Model yang berada di bawah titik layar (px relatif kanvas peta). */
  pick(point: { x: number; y: number }): ModelHit | null {
    if (this.vehicleGroup.visible) {
      for (const [id, rec] of this.vehicles) {
        if (!rec.onScreen) continue;
        const d = Math.hypot(point.x - rec.centerX, point.y - rec.centerY);
        if (d <= rec.radius) return { kind: "vehicle", id };
      }
    }
    if (this.busGroup.visible) {
      for (const [id, rec] of this.buses) {
        if (!rec.onScreen) continue;
        const d = Math.hypot(point.x - rec.centerX, point.y - rec.centerY);
        if (d <= rec.radius) return { kind: "bus", id };
      }
    }
    if (!this.nodeGroup.visible) return null;
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const [id, rec] of this.nodes) {
      if (!rec.onScreen) continue;
      // Jarak titik ke ruas alas–puncak model.
      const dx = rec.topX - rec.baseX;
      const dy = rec.topY - rec.baseY;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq
        ? Math.max(
            0,
            Math.min(
              1,
              ((point.x - rec.baseX) * dx + (point.y - rec.baseY) * dy) /
                lengthSq,
            ),
          )
        : 0;
      const d = Math.hypot(
        point.x - (rec.baseX + dx * t),
        point.y - (rec.baseY + dy * t),
      );
      if (d <= rec.radius + 3 && d < bestDistance) {
        best = id;
        bestDistance = d;
      }
    }
    return best ? { kind: "node", id: best } : null;
  }

  // ─── Geometri ─────────────────────────────────────────────────────────────
  private toLocal(lng: number, lat: number): [number, number] {
    const m = MercatorCoordinate.fromLngLat([lng, lat]);
    return [
      (m.x - this.originMerc.x) / this.unit,
      -(m.y - this.originMerc.y) / this.unit,
    ];
  }

  private setPath(rec: PathRec, path: [number, number][]) {
    rec.lngLat = path;
    rec.xy = new Float64Array(path.length * 2);
    rec.cum = new Float64Array(path.length);
    for (let i = 0; i < path.length; i++) {
      const [x, y] = this.toLocal(path[i][0], path[i][1]);
      rec.xy[i * 2] = x;
      rec.xy[i * 2 + 1] = y;
      if (i > 0) {
        rec.cum[i] =
          rec.cum[i - 1] +
          Math.hypot(x - rec.xy[i * 2 - 2], y - rec.xy[i * 2 - 1]);
      }
    }
  }

  /** Posisi kendaraan pada `shown` x panjang rute. Mengembalikan arah ruasnya. */
  private placeOnPath(rec: PathRec): number | null {
    const { xy, cum, lngLat } = rec;
    const last = cum.length - 1;
    const total = cum[last];
    if (last < 1 || total <= 0) {
      rec.segment = 0;
      rec.x = xy[0];
      rec.y = xy[1];
      [rec.lng, rec.lat] = lngLat[0];
      return null;
    }
    const distance = rec.shown * total;
    let lo = 0;
    let hi = last - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= distance) lo = mid;
      else hi = mid - 1;
    }
    const span = cum[lo + 1] - cum[lo];
    const t = span > 0 ? Math.min(1, (distance - cum[lo]) / span) : 0;
    const x0 = xy[lo * 2];
    const y0 = xy[lo * 2 + 1];
    const dx = xy[lo * 2 + 2] - x0;
    const dy = xy[lo * 2 + 3] - y0;
    rec.segment = lo;
    rec.x = x0 + dx * t;
    rec.y = y0 + dy * t;
    rec.lng = lngLat[lo][0] + (lngLat[lo + 1][0] - lngLat[lo][0]) * t;
    rec.lat = lngLat[lo][1] + (lngLat[lo + 1][1] - lngLat[lo][1]) * t;
    return span > 0 ? Math.atan2(dy, dx) : null;
  }

  private project(x: number, y: number, z: number, out: ScreenPoint) {
    const e = this.viewProj.elements;
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    out.w = w;
    out.x = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w / 2 + 0.5) * this.width;
    out.y =
      (0.5 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / w / 2) * this.height;
  }

  /** Piksel layar per meter di sebuah titik (0 bila titik di belakang kamera). */
  private pixelsPerMeter(x: number, y: number, z: number): number {
    const span = 10;
    this.project(x, y, z, this.p0);
    this.project(x + this.right.x * span, y + this.right.y * span, z, this.p1);
    if (this.p0.w <= 0 || this.p1.w <= 0) return 0;
    return Math.hypot(this.p1.x - this.p0.x, this.p1.y - this.p0.y) / span;
  }

  private refreshElevations(map: MapLibreMap) {
    this.centerZ = map.queryTerrainElevation(map.getCenter()) ?? 0;
    this.nodes.forEach((rec) => {
      rec.z = map.queryTerrainElevation([rec.lng, rec.lat]) ?? 0;
    });
    this.vehicles.forEach((rec) => {
      rec.z = map.queryTerrainElevation([rec.lng, rec.lat]) ?? 0;
    });
    if (this.busGroup.visible) {
      this.buses.forEach((rec) => {
        rec.z = map.queryTerrainElevation([rec.lng, rec.lat]) ?? 0;
      });
    }
  }

  /** Arah hadap mengikuti ruas rute, diputar halus saat berbelok. */
  private turnToward(rec: PathRec, pathHeading: number | null, dt: number) {
    if (pathHeading === null) return;
    if (rec.heading === null) {
      rec.heading = pathHeading;
      return;
    }
    let diff = pathHeading - rec.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    rec.heading += diff * (1 - Math.exp(-dt * 8));
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const map = this.map;
    if (!map) return;

    const now = performance.now();
    const elapsed = this.lastFrame ? (now - this.lastFrame) / 1000 : 0;
    this.lastFrame = now;
    const dt = Math.min(elapsed, 0.1);
    const time = now / 1000;

    // Progres kendaraan tetap berjalan walau layernya sedang disembunyikan.
    this.vehicles.forEach((rec) => {
      rec.shown = Math.min(rec.target, rec.shown + rec.rate * elapsed);
    });

    const showNodes = this.nodeGroup.visible && this.nodes.size > 0;
    const showVehicles = this.vehicleGroup.visible && this.vehicles.size > 0;
    const showBuses =
      this.busGroup.visible && this.buses.size > 0 && this.sampleBus !== null;
    if (!showNodes && !showVehicles && !showBuses) return;

    if (now - this.elevatedAt > ELEVATION_REFRESH_MS) {
      this.elevatedAt = now;
      this.refreshElevations(map);
    }

    this.viewProj
      .fromArray(args.defaultProjectionData.mainMatrix)
      .multiply(this.sceneMatrix);

    // Sumbu kamera di kerangka peta: kanan layar, atas layar, dan arah ke kamera.
    const bearing = map.getBearing() * DEG;
    const pitch = map.getPitch() * DEG;
    this.right.set(Math.cos(bearing), -Math.sin(bearing), 0);
    this.up.set(
      Math.sin(bearing) * Math.cos(pitch),
      Math.cos(bearing) * Math.cos(pitch),
      Math.sin(pitch),
    );
    this.normal.crossVectors(this.right, this.up);
    this.basis.makeBasis(this.right, this.up, this.normal);
    this.billboard.setFromRotationMatrix(this.basis);

    const zoom = map.getZoom();
    const center = map.getCenter();
    const [centerX, centerY] = this.toLocal(center.lng, center.lat);
    const centerPpm = this.pixelsPerMeter(centerX, centerY, this.centerZ) || 1;
    let animating = showVehicles;

    if (showNodes) {
      const px = sizeAtZoom(NODE_PX, zoom);
      const badgeWidth = sizeAtZoom(BADGE_PX, zoom) / px;
      this.nodes.forEach((rec) => {
        const ppm = this.pixelsPerMeter(rec.x, rec.y, rec.z);
        rec.onScreen = ppm > 0;
        rec.model.root.visible = rec.onScreen;
        if (!rec.onScreen) return;

        const growTarget = rec.selected ? SELECTED_GROW : 1;
        rec.grow += (growTarget - rec.grow) * Math.min(1, dt * 10);
        if (Math.abs(growTarget - rec.grow) < 0.004) rec.grow = growTarget;
        else animating = true;
        if (rec.model.kritis) animating = true;

        // Kompensasi perspektif setengah: marker jauh tidak mengecil sedrastis
        // objek dunia nyata, tapi kedalaman 3D-nya masih terasa.
        const scale = Math.max(
          (px * rec.grow) / Math.sqrt(ppm * centerPpm),
          NODE_MIN_METERS,
        );
        rec.model.root.position.set(rec.x, rec.y, rec.z);
        rec.model.root.scale.setScalar(scale);
        rec.model.badge.quaternion.copy(this.billboard);
        rec.model.setBadgeWidth(badgeWidth);
        rec.model.animate(time);

        this.project(rec.x, rec.y, rec.z, this.p0);
        rec.baseX = this.p0.x;
        rec.baseY = this.p0.y;
        this.project(rec.x, rec.y, rec.z + SIGNAL_TOP * scale, this.p0);
        rec.topX = this.p0.x;
        rec.topY = this.p0.y;
        rec.headY = rec.topY;
        if (rec.model.kritis) {
          this.project(
            rec.x,
            rec.y,
            rec.z + rec.model.badgeTop * scale,
            this.p0,
          );
          rec.headY = this.p0.y;
        }
        rec.radius = SIGNAL_RADIUS * scale * ppm;
      });
    }

    if (showVehicles) {
      const px = sizeAtZoom(VEHICLE_PX, zoom);
      this.vehicles.forEach((rec) => {
        this.turnToward(rec, this.placeOnPath(rec), dt);
        const ppm = this.pixelsPerMeter(rec.x, rec.y, rec.z);
        rec.onScreen = ppm > 0;
        rec.model.root.visible = rec.onScreen;
        if (!rec.onScreen) return;

        const scale = Math.max(
          px / Math.sqrt(ppm * centerPpm),
          VEHICLE_MIN_METERS,
        );
        rec.model.root.position.set(rec.x, rec.y, rec.z);
        rec.model.root.scale.setScalar(scale);
        rec.model.setHeading(rec.heading ?? 0);
        rec.model.animate(time, dt, rec.shown < rec.target);

        this.project(rec.x, rec.y, rec.z, this.p0);
        const baseY = this.p0.y;
        this.project(rec.x, rec.y, rec.z + AMBULANCE_TOP * scale, this.p0);
        rec.height = Math.max(0, baseY - this.p0.y);
        this.project(rec.x, rec.y, rec.z + (AMBULANCE_TOP / 2) * scale, this.p0);
        rec.centerX = this.p0.x;
        rec.centerY = this.p0.y;
        rec.radius = Math.max(0.5 * scale * ppm, VEHICLE_MIN_HIT_PX);
      });
    }

    if (showBuses) {
      const px = sizeAtZoom(BUS_PX, zoom);
      const labelPx = sizeAtZoom(BUS_LABEL_PX, zoom);
      const nowMs = Date.now();
      this.buses.forEach((rec, id) => {
        const hidden =
          this.busRouteFilter !== null && rec.routeId !== this.busRouteFilter;
        rec.onScreen = false;
        rec.model.root.visible = false;
        if (hidden) return;

        const sample = this.sampleBus!(id, nowMs);
        rec.shown = sample.progress;
        this.turnToward(rec, this.placeOnPath(rec), dt);
        const ppm = this.pixelsPerMeter(rec.x, rec.y, rec.z);
        if (ppm <= 0) return;
        rec.onScreen = true;
        rec.model.root.visible = true;

        const scale = Math.max(px / Math.sqrt(ppm * centerPpm), BUS_MIN_METERS);
        rec.model.root.position.set(rec.x, rec.y, rec.z);
        rec.model.root.scale.setScalar(scale);
        rec.model.setHeading(rec.heading ?? 0);
        rec.model.setLate(sample.late);
        rec.model.label.quaternion.copy(this.billboard);
        // Label berukuran tetap di layar, berapa pun skala busnya.
        rec.model.setLabelWidth(labelPx / (scale * ppm));
        rec.model.animate(time, sample.moving);

        this.project(rec.x, rec.y, rec.z, this.p0);
        const baseY = this.p0.y;
        this.project(
          rec.x,
          rec.y,
          rec.z + rec.model.label.position.z * scale,
          this.p0,
        );
        rec.height = Math.max(0, baseY - this.p0.y) + labelPx * 0.2;
        this.project(rec.x, rec.y, rec.z + (BUS_TOP / 2) * scale, this.p0);
        rec.centerX = this.p0.x;
        rec.centerY = this.p0.y;
        rec.radius = Math.max(0.5 * scale * ppm, VEHICLE_MIN_HIT_PX);
      });
    }

    // Renderer dibuat di dalam render() supaya perubahan state GL-nya ikut
    // di-reset MapLibre setelah layer kustom selesai digambar.
    if (!this.renderer) {
      this.renderer = new WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      this.renderer.autoClear = false;
    }
    this.camera.projectionMatrix.copy(this.viewProj);
    this.camera.projectionMatrixInverse.copy(this.viewProj).invert();
    this.renderer.resetState();
    // Marker selalu di atas bangunan 3D: depth peta dibuang, lalu model hanya
    // saling menutupi satu sama lain.
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);

    if (animating || (showBuses && zoom >= BUS_SMOOTH_ZOOM)) {
      map.triggerRepaint();
    } else if (showBuses && this.busTimer === null) {
      this.busTimer = setTimeout(() => {
        this.busTimer = null;
        this.map?.triggerRepaint();
      }, BUS_IDLE_FRAME_MS);
    }
  }
}
