// Konfigurasi basemap peta Digital Twin (MapLibre GL).
//
// Default: OpenFreeMap "positron" (vektor, skema OpenMapTiles, tanpa API key).
// Alternatif lebih detail: https://tiles.openfreemap.org/styles/liberty
//
// Bisa diganti lewat environment variable (mis. di .env):
//   NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
//   NEXT_PUBLIC_MAP_LABEL_FONT=Noto Sans Bold
// Style pengganti harus punya source vektor bernama "openmaptiles" dengan
// source-layer "building" supaya bangunan 3D tetap tampil, dan font label
// harus tersedia di glyph server style itu.

export const DEFAULT_MAP_STYLE_URL =
  "https://tiles.openfreemap.org/styles/positron";

export const MAP_STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;

/** Font untuk label layer buatan sendiri (badge persen pada pin). */
export const MAP_LABEL_FONT = [
  process.env.NEXT_PUBLIC_MAP_LABEL_FONT || "Noto Sans Bold",
];
