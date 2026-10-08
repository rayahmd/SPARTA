// Model 3D low-poly untuk marker peta Digital Twin: lampu lalu lintas di tiap
// persimpangan dan ambulans Vanguard. Semua dibangun dari primitif three.js,
// jadi tidak ada file aset yang perlu diunduh.
//
// Konvensi: `root` memakai kerangka peta (x = timur, y = utara, z = atas) dan
// hanya diberi posisi + skala oleh layer. Bagian modelnya disusun dengan
// konvensi three.js (Y ke atas) di dalam grup yang diputar 90° terhadap X.
// Ukuran dinormalkan: tinggi lampu = 1 unit, panjang ambulans = 1 unit.
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  SphereGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type LampColor = "red" | "yellow" | "green";

const LAMP_ORDER: LampColor[] = ["red", "yellow", "green"];
const LAMP_HEIGHTS = [0.87, 0.72, 0.57];
const LAMP_ON: Record<LampColor, string> = {
  red: "#ff453a",
  yellow: "#ffd60a",
  green: "#30d158",
};
const LAMP_OFF: Record<LampColor, string> = {
  red: "#4a1d1f",
  yellow: "#4a3f14",
  green: "#17402a",
};

const KRITIS_COLOR = "#d32029";

/** Tinggi model lampu (unit) sampai tutup atas. */
export const SIGNAL_TOP = 1.02;
/** Ukuran bidang badge kritis (unit) sebelum diskalakan. */
const BADGE_WIDTH = 0.76;
const BADGE_HEIGHT = 0.38;
const BADGE_GAP = 0.07;
/** Radius alas lampu (unit), dipakai untuk area klik. */
export const SIGNAL_RADIUS = 0.3;
/** Tinggi ambulans (unit) sampai lampu sirene. */
export const AMBULANCE_TOP = 0.5;

const UP = Math.PI / 2;

/** Gabungkan beberapa geometri jadi satu supaya digambar dalam satu draw call. */
function merged(parts: BufferGeometry[]): BufferGeometry {
  const geometry = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return geometry;
}
// Sisi rumah lampu yang diberi lampu: [arah x, arah z].
const LAMP_FACES: [number, number][] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

/**
 * Geometri, material tetap, dan tekstur badge yang dipakai bersama semua model.
 * Dibuat sekali per layer dan dibuang lewat `dispose()`.
 */
export class ModelKit {
  private geometries: BufferGeometry[] = [];
  private materials: Material[] = [];
  private badgeTextures = new Map<number, CanvasTexture>();

  readonly unitBox = this.geo(new BoxGeometry(1, 1, 1));
  /** Bagian berwarna status: alas dan dua tutup rumah lampu. */
  readonly statusParts = this.geo(
    merged([
      new CylinderGeometry(0.25, 0.28, 0.06, 28).translate(0, 0.03, 0),
      new BoxGeometry(0.29, 0.035, 0.29).translate(0, 0.445, 0),
      new BoxGeometry(0.29, 0.035, 0.29).translate(0, 0.9975, 0),
    ]),
  );
  readonly puckInlay = this.geo(new CylinderGeometry(0.17, 0.17, 0.014, 28));
  readonly pole = this.geo(new CylinderGeometry(0.035, 0.042, 0.4, 10));
  /** Satu warna lampu di keempat sisi, supaya terbaca dari semua arah putar peta. */
  readonly lampSet = this.geo(
    merged(
      LAMP_FACES.map(([nx, nz]) =>
        new SphereGeometry(0.064, 14, 10)
          .scale(nx ? 0.55 : 1, 1, nz ? 0.55 : 1)
          .translate(nx * 0.12, 0, nz * 0.12),
      ),
    ),
  );
  readonly disc = this.geo(new CircleGeometry(1, 40));
  readonly ring = this.geo(new RingGeometry(0.86, 1, 48));
  readonly badgePlane = this.geo(new PlaneGeometry(BADGE_WIDTH, BADGE_HEIGHT));
  readonly wheel = this.geo(new CylinderGeometry(0.075, 0.075, 0.052, 16));

  readonly housing = this.lambert("#1f2937");
  readonly metal = this.lambert("#475569");
  readonly white = this.lambert("#f8fafc");
  readonly glass = this.lambert("#1e3a5f");
  readonly stripe = this.lambert("#ef4444");
  readonly tire = this.lambert("#111827");
  readonly hub = this.lambert("#cbd5e1");
  readonly headlight = this.basic("#fef9c3");
  readonly shadow = this.track(
    new MeshBasicMaterial({
      color: "#0f172a",
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );

  private geo<T extends BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }
  private track<T extends Material>(material: T): T {
    this.materials.push(material);
    return material;
  }
  private lambert(color: string) {
    return this.track(new MeshLambertMaterial({ color }));
  }
  private basic(color: string) {
    return this.track(new MeshBasicMaterial({ color }));
  }

  /** Tekstur pil merah "NN%" untuk persimpangan kritis, di-cache per angka. */
  badgeTexture(percent: number): CanvasTexture {
    const key = Math.max(0, Math.min(999, Math.round(percent)));
    const cached = this.badgeTextures.get(key);
    if (cached) return cached;

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const pad = 10;
    const radius = (canvas.height - pad * 2) / 2;
    ctx.beginPath();
    ctx.arc(pad + radius, pad + radius, radius, Math.PI / 2, -Math.PI / 2);
    ctx.arc(canvas.width - pad - radius, pad + radius, radius, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = KRITIS_COLOR;
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 68px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${key}%`, canvas.width / 2, canvas.height / 2 + 4);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.badgeTextures.set(key, texture);
    return texture;
  }

  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.badgeTextures.forEach((t) => t.dispose());
    this.badgeTextures.clear();
  }
}

function part(
  parent: Group,
  geometry: BufferGeometry,
  material: Material,
  x: number,
  y: number,
  z: number,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  // Matriks kamera berasal dari MapLibre, jadi culling bawaan three.js dilewati.
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

/** Kotak berukuran (sx, sy, sz) dengan pusat di (x, y, z). */
function box(
  parent: Group,
  kit: ModelKit,
  material: Material,
  size: [number, number, number],
  x: number,
  y: number,
  z: number,
): Mesh {
  const mesh = part(parent, kit.unitBox, material, x, y, z);
  mesh.scale.set(size[0], size[1], size[2]);
  return mesh;
}

/** Decal datar di permukaan peta (bidang XY kerangka peta). */
function decal(
  parent: Group,
  geometry: BufferGeometry,
  material: Material,
  radius: number,
  z: number,
): Mesh {
  const mesh = part(parent, geometry, material, 0, 0, z);
  mesh.scale.setScalar(radius);
  mesh.renderOrder = -1;
  return mesh;
}

function decalMaterial(color: string, opacity: number) {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

// ─── Lampu lalu lintas (marker persimpangan) ────────────────────────────────
export class SignalModel {
  readonly root = new Group();
  private statusMaterial = new MeshLambertMaterial();
  private haloMaterial = decalMaterial("#ffffff", 0.26);
  private pulseMaterial = decalMaterial(KRITIS_COLOR, 0.7);
  private lampMaterials = LAMP_ORDER.map(
    (lamp) => new MeshBasicMaterial({ color: LAMP_OFF[lamp] }),
  );
  private badgeMaterial = new MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  private pulse: Mesh;
  /** Billboard badge persen; orientasinya diatur layer supaya menghadap kamera. */
  readonly badge: Mesh;
  kritis = false;
  /** Tinggi (unit) sampai tepi atas badge kritis. */
  badgeTop = SIGNAL_TOP;

  constructor(private kit: ModelKit) {
    const body = new Group();
    body.rotation.x = UP;
    this.root.add(body);

    // Alas berwarna status kemacetan + lingkar halo di permukaan peta.
    decal(this.root, kit.disc, this.haloMaterial, 0.44, 0.004);
    this.pulse = decal(this.root, kit.ring, this.pulseMaterial, 0.44, 0.006);
    this.pulse.visible = false;
    part(body, kit.statusParts, this.statusMaterial, 0, 0, 0);
    part(body, kit.puckInlay, kit.white, 0, 0.066, 0);

    part(body, kit.pole, kit.metal, 0, 0.26, 0);
    box(body, kit, kit.housing, [0.24, 0.52, 0.24], 0, 0.72, 0);
    LAMP_ORDER.forEach((_, i) => {
      part(body, kit.lampSet, this.lampMaterials[i], 0, LAMP_HEIGHTS[i], 0);
    });

    this.badge = part(this.root, kit.badgePlane, this.badgeMaterial, 0, 0, 0);
    this.badge.renderOrder = 10;
    this.badge.visible = false;
    this.setBadgeWidth(BADGE_WIDTH);
  }

  /**
   * Lebar badge dalam unit model. Badge diskalakan terpisah dari lampunya
   * supaya angka persen tetap terbaca saat modelnya kecil.
   */
  setBadgeWidth(width: number) {
    const factor = width / BADGE_WIDTH;
    this.badge.scale.setScalar(factor);
    this.badge.position.z =
      SIGNAL_TOP + BADGE_GAP + (BADGE_HEIGHT * factor) / 2;
    this.badgeTop = SIGNAL_TOP + BADGE_GAP + BADGE_HEIGHT * factor;
  }

  /** `color` = warna status kemacetan; `lamp` = lampu yang menyala. */
  setStatus(color: string, lamp: LampColor) {
    this.statusMaterial.color.set(color);
    this.haloMaterial.color.set(color);
    LAMP_ORDER.forEach((name, i) => {
      this.lampMaterials[i].color.set(
        name === lamp ? LAMP_ON[name] : LAMP_OFF[name],
      );
    });
  }

  setKritis(kritis: boolean, percent: number) {
    this.kritis = kritis;
    this.badge.visible = kritis;
    this.pulse.visible = kritis;
    if (!kritis) return;
    const texture = this.kit.badgeTexture(percent);
    if (this.badgeMaterial.map !== texture) {
      this.badgeMaterial.map = texture;
      this.badgeMaterial.needsUpdate = true;
    }
  }

  /** Denyut lingkar merah pada persimpangan kritis. `time` dalam detik. */
  animate(time: number) {
    if (!this.kritis) return;
    const phase = (time * 0.8) % 1;
    this.pulse.scale.setScalar(0.44 * (1 + phase * 1.1));
    this.pulseMaterial.opacity = 0.7 * (1 - phase);
  }

  dispose() {
    this.statusMaterial.dispose();
    this.haloMaterial.dispose();
    this.pulseMaterial.dispose();
    this.badgeMaterial.dispose();
    this.lampMaterials.forEach((m) => m.dispose());
  }
}

// ─── Ambulans Vanguard ──────────────────────────────────────────────────────
const SIREN_ON = { red: "#ff3b30", blue: "#3b82f6" };
const SIREN_OFF = { red: "#5c1a16", blue: "#172f5c" };
const GREEN_WAVE_COLOR = "#22c55e";
const NO_GREEN_WAVE_COLOR = "#ef4444";
/** Radius lingkar status di bawah ambulans (unit). */
const AMBULANCE_RING = 0.62;

export class AmbulanceModel {
  readonly root = new Group();
  /** Diputar terhadap sumbu atas mengikuti arah rute (0 = timur). */
  private headingGroup = new Group();
  private wheels: Group[] = [];
  private sirenRed = new MeshBasicMaterial({ color: SIREN_ON.red });
  private sirenBlue = new MeshBasicMaterial({ color: SIREN_OFF.blue });
  private zoneMaterial = decalMaterial(GREEN_WAVE_COLOR, 0.16);
  private ringMaterial = decalMaterial(GREEN_WAVE_COLOR, 0.9);
  private pulseMaterial = decalMaterial(GREEN_WAVE_COLOR, 0.6);
  private pulse: Mesh;
  private body = new Group();

  constructor(kit: ModelKit) {
    // Lingkar status green wave di bawah kendaraan (hijau = aktif, merah = tidak).
    decal(this.root, kit.disc, this.zoneMaterial, 0.56, 0.004);
    decal(this.root, kit.ring, this.ringMaterial, AMBULANCE_RING, 0.006);
    this.pulse = decal(
      this.root,
      kit.ring,
      this.pulseMaterial,
      AMBULANCE_RING,
      0.008,
    );

    this.root.add(this.headingGroup);
    const shadow = decal(this.headingGroup, kit.disc, kit.shadow, 1, 0.01);
    shadow.scale.set(0.56, 0.24, 1);
    shadow.renderOrder = 0;

    const body = this.body;
    body.rotation.x = UP;
    this.headingGroup.add(body);

    // Badan: modul pasien, kabin, kap mesin (depan = +X).
    box(body, kit, kit.white, [0.62, 0.36, 0.36], -0.19, 0.28, 0);
    box(body, kit, kit.white, [0.26, 0.27, 0.34], 0.25, 0.235, 0);
    box(body, kit, kit.white, [0.12, 0.14, 0.34], 0.44, 0.17, 0);
    box(body, kit, kit.tire, [0.03, 0.05, 0.36], 0.495, 0.115, 0);
    // Kaca depan dan kaca samping kabin.
    box(body, kit, kit.glass, [0.014, 0.11, 0.29], 0.381, 0.295, 0);
    box(body, kit, kit.glass, [0.17, 0.1, 0.346], 0.265, 0.295, 0);
    // Strip merah keliling modul pasien.
    box(body, kit, kit.stripe, [0.6, 0.05, 0.366], -0.19, 0.2, 0);
    box(body, kit, kit.stripe, [0.626, 0.05, 0.34], -0.19, 0.2, 0);
    // Palang merah di kedua sisi dan di atap.
    box(body, kit, kit.stripe, [0.11, 0.035, 0.37], -0.22, 0.345, 0);
    box(body, kit, kit.stripe, [0.035, 0.11, 0.37], -0.22, 0.345, 0);
    box(body, kit, kit.stripe, [0.16, 0.008, 0.05], -0.22, 0.462, 0);
    box(body, kit, kit.stripe, [0.05, 0.008, 0.16], -0.22, 0.462, 0);
    // Lampu depan.
    box(body, kit, kit.headlight, [0.012, 0.035, 0.07], 0.503, 0.185, 0.115);
    box(body, kit, kit.headlight, [0.012, 0.035, 0.07], 0.503, 0.185, -0.115);
    // Lampu sirene di atas kabin.
    box(body, kit, kit.tire, [0.06, 0.014, 0.3], 0.07, 0.467, 0);
    box(body, kit, this.sirenRed, [0.05, 0.034, 0.13], 0.07, 0.49, 0.075);
    box(body, kit, this.sirenBlue, [0.05, 0.034, 0.13], 0.07, 0.49, -0.075);

    // Roda: grup diputar terhadap sumbu roda supaya jari-jarinya terlihat berputar.
    for (const x of [0.3, -0.3]) {
      for (const z of [0.165, -0.165]) {
        const wheel = new Group();
        wheel.position.set(x, 0.075, z);
        const tire = part(wheel, kit.wheel, kit.tire, 0, 0, 0);
        tire.rotation.x = UP;
        box(wheel, kit, kit.hub, [0.11, 0.028, 0.058], 0, 0, 0);
        box(wheel, kit, kit.hub, [0.028, 0.11, 0.058], 0, 0, 0);
        body.add(wheel);
        this.wheels.push(wheel);
      }
    }
  }

  setGreenWave(on: boolean) {
    const color = on ? GREEN_WAVE_COLOR : NO_GREEN_WAVE_COLOR;
    this.zoneMaterial.color.set(color);
    this.ringMaterial.color.set(color);
    this.pulseMaterial.color.set(color);
  }

  setHeading(radians: number) {
    this.headingGroup.rotation.z = radians;
  }

  /**
   * @param time waktu animasi (detik)
   * @param dt selisih waktu frame (detik)
   * @param moving kendaraan sedang melaju (roda berputar, badan bergetar halus)
   */
  animate(time: number, dt: number, moving: boolean) {
    const redOn = Math.floor(time * 5) % 2 === 0;
    this.sirenRed.color.set(redOn ? SIREN_ON.red : SIREN_OFF.red);
    this.sirenBlue.color.set(redOn ? SIREN_OFF.blue : SIREN_ON.blue);

    const phase = (time * 0.9) % 1;
    this.pulse.scale.setScalar(AMBULANCE_RING * (1 + phase * 0.3));
    this.pulseMaterial.opacity = 0.6 * (1 - phase);

    if (moving) {
      for (const wheel of this.wheels) wheel.rotation.z -= dt * 9;
      this.body.position.z = Math.sin(time * 11) * 0.004;
    } else {
      this.body.position.z = 0;
    }
  }

  dispose() {
    this.sirenRed.dispose();
    this.sirenBlue.dispose();
    this.zoneMaterial.dispose();
    this.ringMaterial.dispose();
    this.pulseMaterial.dispose();
  }
}
