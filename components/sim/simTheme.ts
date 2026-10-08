// Warna dan label bersama untuk panel simulasi. Warna UI panel berasal dari
// palet DESIGN.md / app/globals.css. Warna scene 3D mengikuti gambar referensi
// (gaya isometrik ala SUMO: rumput, aspal gelap, marka putih, kendaraan berwarna).

import type { SignalColor, VehicleType } from "@/lib/sim/types";

/** Warna lampu = warna status lalu lintas di globals.css. */
export const SIGNAL_COLORS: Record<SignalColor, string> = {
  green: "#16A34A",
  yellow: "#EAB308",
  red: "#DC2626",
};

export const SIGNAL_LABELS: Record<SignalColor, string> = {
  green: "Hijau",
  yellow: "Kuning",
  red: "Merah",
};

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  motor: "Motor",
  mobil: "Mobil",
  bus: "Bus",
  truk: "Truk",
};

/** Warna badan mobil, jaket pengendara motor, dan kabin truk (dipilih per kendaraan). */
export const VEHICLE_PALETTE = [
  "#2563EB",
  "#F9FAFB",
  "#9CA3AF",
  "#E48E07",
  "#B91C1C",
  "#7C3AED",
  "#0F766E",
  "#374151",
] as const;

export const SCENE_COLORS = {
  background: "#f3f4f6",
  grass: "#8BBF52",
  hedge: "#5C9E3F",
  foliage: "#3F8F3A",
  trunk: "#7A5230",
  asphalt: "#3B424D",
  sidewalk: "#D1D5DB",
  marking: "#ffffff",
  pole: "#4B5563",
  lampHead: "#E5E7EB",
  lampOff: "#1f2937",
  glass: "#334155",
  motorBody: "#1F2937",
  busBody: "#F9FAFB",
  cargo: "#E5E7EB",
} as const;

const NUMBER_FORMAT_0 = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});
const NUMBER_FORMAT_1 = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatNumber(value: number, decimals: 0 | 1 = 0): string {
  return (decimals === 1 ? NUMBER_FORMAT_1 : NUMBER_FORMAT_0).format(value);
}

/** Jam simulasi mm:ss. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
