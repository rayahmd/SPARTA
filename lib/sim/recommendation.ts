// Menerjemahkan teks rekomendasi AI (kolom TrafficNode.recommendation) menjadi
// bentuk terstruktur. Teks yang ada di repo saat ini:
//   "+15 detik Durasi Hijau", "+10 detik Durasi Hijau", "-10 detik Durasi Hijau",
//   "Tambah durasi hijau +10 detik", "Aktifkan siklus sinyal adaptif".

import type { ParsedRecommendation } from "./types";

const GREEN_DELTA = /([+\-−])\s*(\d{1,3})\s*(?:detik|dtk|s)\b/i;
const ADAPTIVE = /adaptif/i;

export function parseRecommendation(
  raw: string | null | undefined,
): ParsedRecommendation {
  const text = raw?.trim();
  if (!text) return { kind: "none", raw: null };

  const match = GREEN_DELTA.exec(text);
  if (match) {
    const sign = match[1] === "+" ? 1 : -1;
    return { kind: "green-delta", deltaSec: sign * Number(match[2]), raw: text };
  }
  if (ADAPTIVE.test(text)) return { kind: "adaptive", raw: text };
  return { kind: "unparsed", raw: text };
}
