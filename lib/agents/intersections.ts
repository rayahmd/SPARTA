// Daftar simpang cadangan, sama dengan prisma/seed.ts. Dipakai bila database
// tidak tersedia, dan oleh test supaya hasilnya tidak bergantung isi dev.db.

import { slugify } from "./model";
import type { IntersectionInfo } from "./types";

const SEED_INTERSECTIONS = [
  { name: "Simpang Ahmad Yani (Dolog)", lat: -7.3204, lng: 112.7314 },
  { name: "Simpang Wonokromo (KBS)", lat: -7.2974, lng: 112.7369 },
  { name: "Simpang Mayjen Sungkono (Ciputra World)", lat: -7.2917, lng: 112.7161 },
  { name: "Simpang Diponegoro (Pasar Kupang)", lat: -7.2831, lng: 112.731 },
  { name: "Simpang Raya Gubeng (Stasiun Gubeng)", lat: -7.2655, lng: 112.7516 },
  { name: "Simpang Pemuda (Monkasel)", lat: -7.2657, lng: 112.7478 },
  { name: "Simpang Kertajaya (Dharmawangsa)", lat: -7.2736, lng: 112.7592 },
  { name: "Simpang HR Muhammad (Patung Kuda)", lat: -7.2842, lng: 112.6931 },
  { name: "Simpang Darmo (Taman Bungkul)", lat: -7.2916, lng: 112.7381 },
  { name: "Simpang Tunjungan (Gedung Grahadi)", lat: -7.2628, lng: 112.7423 },
  { name: "Simpang Jemursari (Kendangsari)", lat: -7.3197, lng: 112.746 },
  { name: "Simpang Merr (Kenjeran)", lat: -7.265, lng: 112.7845 },
];

export const DEFAULT_INTERSECTIONS: IntersectionInfo[] = SEED_INTERSECTIONS.map((n) => ({
  id: slugify(n.name),
  ...n,
}));

/**
 * Satu agent per lokasi fisik: baris dengan nama dan koordinat sama (mis. seed
 * yang dijalankan dua kali) digabung; id lain dicatat di `aliasIds`.
 */
export function dedupeIntersections(list: IntersectionInfo[]): IntersectionInfo[] {
  const groups = new Map<string, IntersectionInfo[]>();
  for (const n of list) {
    const key = `${n.name.trim().toLowerCase()}|${n.lat.toFixed(4)}|${n.lng.toFixed(4)}`;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  return [...groups.values()].map((group) => {
    const sorted = group.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    const aliasIds = sorted.slice(1).map((n) => n.id);
    return { ...sorted[0], aliasIds: [...(sorted[0].aliasIds ?? []), ...aliasIds] };
  });
}
