# Rencana Adaptasi: Simulasi 3D Persimpangan (SPARTA-Ephor)

Tanggal eksplorasi: 2026-10-08 · Branch: `impeccable` · HEAD: `920bbb9` · Status dokumen: rencana, belum ada kode aplikasi yang diubah.

> Catatan penting soal nomor baris: working tree punya perubahan **belum di-commit** di 11 file, termasuk `components/dashboard/DigitalTwinMapInner.tsx`. Semua nomor baris di dokumen ini mengacu ke **working tree saat ini** (1925 baris), bukan ke HEAD. Tiap titik sisip juga diberi string jangkar supaya tetap bisa ditemukan kalau baris bergeser.

## Catatan implementasi (2026-10-08)

Fitur sudah diimplementasikan. Tiga hal berbeda dari rencana di bawah:

1. **Dependency dipasang dengan npm, bukan Bun.** `bun.lock` ternyata basi (tidak memuat `maplibre-gl`), sedangkan `node_modules` dipasang dengan npm dan `package-lock.json` yang sinkron. `bun add` akan menaikkan `maplibre-gl` 6.1.0 → 6.13.0, padahal kode peta mengunci worker ke 6.1.0. Perintah yang dipakai: `npm install three @react-three/fiber @react-three/drei` dan `npm install -D @types/three @types/bun`. Bun hanya dipakai untuk `bun test lib/sim`.
2. **Tampilan scene 3D mengikuti gambar referensi dari pemilik proyek** (isometrik ala SUMO: rumput, trotoar, zebra cross, pohon, lampu jalan, kendaraan berbentuk dan berwarna-warni, garis henti berwarna sinyal), bukan kotak polos berwarna per jenis seperti di bagian 4 dan prompt.
3. **File tambahan di luar daftar 4.1:** `lib/sim/layout.ts` (tata letak dan lintasan, dipakai engine dan scene), `components/sim/simTheme.ts`, `components/sim/scene/Scenery.tsx`, `components/sim/scene/StaticInstances.tsx`.

4. **Bentuk simpang mengikuti jalan sebenarnya, bukan selalu perempatan.** Saat tombol Simulasi 3D diklik, jumlah lengan dan arahnya dibaca dari data jalan OpenStreetMap yang sedang dimuat peta (`lib/sim/junction.ts`, `components/sim/junctionFromMap.ts`), lalu engine dan scene memakai 2–5 lengan berarah bebas (`lib/sim/layout.ts`). Jumlah lajur masih diperkirakan dari kelas jalan. Bila data jalan di sekitar pin tidak membentuk simpang, dipakai perempatan default dan panel menyebutkannya. Uraian tipe di bagian 5 (`ApproachId = "N" | "E" | "S" | "W"`) sudah tidak berlaku: id pendekat kini string dan tiap pendekat punya `bearingDeg`.

## Catatan redesain layout peta (2026-10-08)

- Basemap: OpenFreeMap `positron` (vektor, tanpa API key), bisa diganti lewat `NEXT_PUBLIC_MAP_STYLE_URL` (`lib/config/map.ts`). Tile raster Carto dihapus.
- `/ephor`: peta mengisi seluruh area konten; judul, AI Recommendation, dan SPARTA Vanguard jadi panel floating yang bisa dilipat.
- UI Prediction disembunyikan lewat `SHOW_PREDICTION_UI` di `lib/config/features.ts`; `/ephor/prediction` redirect ke `/ephor`.
- Popup pin dibangun ulang sebagai card (`components/dashboard/NodePopupCard.tsx`).
- Screenshot verifikasi ada di `docs/screenshots/`.

---

## 1. Temuan codebase

### 1.1 Stack dan tooling

| Hal | Temuan | Sumber |
|---|---|---|
| Router | App Router, route group `app/(dashboard)/ephor/*`, root `/` redirect ke `/ephor` | `app/page.tsx`, `app/(dashboard)/layout.tsx` |
| Next / React | `next 16.2.10`, `react 19.2.4`, `react-dom 19.2.4` (terpasang) | `package.json`, `node_modules` |
| TypeScript | `5.9.3`, `strict: true`, `moduleResolution: bundler`, alias `@/*` → root, `include: **/*.ts(x)` | `tsconfig.json` |
| Tailwind | v4 (`4.3.2`) via `@tailwindcss/postcss`, tanpa `tailwind.config`, token di `app/globals.css` | `postcss.config.mjs`, `app/globals.css` |
| UI kit | shadcn gaya `base-nova` di atas `@base-ui/react 1.6.0` (bukan Radix), ikon `lucide-react` | `components.json`, `components/ui/*` |
| Peta | `maplibre-gl 6.1.0` (Digital Twin). `leaflet`/`react-leaflet` hanya untuk `CCTVMap.tsx` | `components/dashboard/*` |
| Data | Prisma 6 + **SQLite** (`prisma/dev.db`), bukan PostgreSQL | `prisma/schema.prisma` |
| Fetch | `swr` untuk GET polling 5 dtk; `fetch` POST biasa untuk aksi | `app/(dashboard)/ephor/page.tsx` |
| Package manager | README dan `prisma.seed` memakai **Bun** (`bun 1.3.2` terpasang). `bun.lock` **dan** `package-lock.json` sama-sama ter-track | `README.md`, `package.json` |
| Lint | ESLint 9 flat config, `eslint-config-next` core-web-vitals + typescript, `eslint-plugin-react-hooks 7.1.1` (aturan React Compiler aktif: `set-state-in-effect`, `purity`, `refs`) | `eslint.config.mjs` |
| Test runner | **tidak ditemukan** (tidak ada vitest/jest/playwright, tidak ada file test) | `package.json` |
| Aturan repo | `AGENTS.md`: wajib baca panduan di `node_modules/next/dist/docs/` sebelum menulis kode | `AGENTS.md`, `CLAUDE.md` |
| State management | Hanya `useState`/`useRef` lokal + SWR. Tidak ada zustand/redux/context | seluruh `app/`, `components/` |

Baseline kualitas (dijalankan read-only saat eksplorasi):

- `npx tsc --noEmit --incremental false` → **lolos** (exit 0).
- `npx eslint app components lib` → **39 masalah (6 error, 33 warning)**, semuanya sudah ada sebelumnya, di: `ephor/vanguard/page.tsx`, `CCTVMap.tsx`, `IncidentDialog.tsx`, `VanguardPanel.tsx`, `lib/hooks/useVehicleRoute.ts`, `lib/simulation/vanguardSimulator.ts` (+ warning di beberapa halaman).
- `npx eslint components/dashboard/DigitalTwinMapInner.tsx components/dashboard/DigitalTwinMap.tsx` → **bersih** (0 error, 0 warning). Ini patokan setelah diedit.

### 1.2 `components/dashboard/DigitalTwinMapInner.tsx` (1925 baris, `"use client"`)

Pemakai komponen:

| Halaman | Cara muat | `activeTab` | `onApprove` |
|---|---|---|---|
| `/ephor` (`app/(dashboard)/ephor/page.tsx:117`) | lewat `DigitalTwinMap.tsx` (`next/dynamic`, `ssr:false`) | `live` \| `prediction` | ada (POST approve) |
| `/ephor/live-map` (`live-map/page.tsx:13`) | lewat `DigitalTwinMap.tsx` | default `live` | tidak ada |
| `/ephor/prediction` (`prediction/page.tsx:7,167`) | `next/dynamic` langsung ke `DigitalTwinMapInner` | `prediction` | ada (lokal, `console.log`) |

Cara pin persimpangan dibuat:

- Pin **bukan** `Marker` DOM, melainkan layer simbol MapLibre `nodes-layer` (baris 1388–1413) di atas source GeoJSON `nodes`. Ikon dipilih lewat properti feature `icon: pin-<green|yellow|orange|red>[-k]` (baris 1625).
- 8 varian gambar didaftarkan oleh `registerStaticPinImages()` (baris 217–276) dan baru setelah itu `setMapReady(true)` (baris 1512–1515). Effect pengisi source `nodes` (baris 1601–1643) bergantung pada `mapReady`.
- Badge persen: `kritis-badge-layer` (baris 1444–1481) dan `badges-layer` (baris 1414–1440).
- Marker DOM (`markersRef`) hanya untuk overlay CCTV / lampu / laporan / event (baris 1742–1835) dan kendaraan Vanguard (baris 1695–1739).

Event klik yang sudah ada (baris 1483–1501, `map.on("click", "nodes-layer", …)`):

1. Cari node dari `latestRef.current.nodes`.
2. Tab `live`: kalau `onApprove` ada **dan** node punya `recommendation` → **langsung memanggil `onApprove(node.id, "approve")`**; selain itu `onNodeSelect(node)`.
3. Tab lain: toggle `selectedNode`.
4. Selalu memanggil `openNodePopup(node, lngLat)`.

Popup yang sudah ada:

- `nodePopupHTML()` (baris 378–425) menghasilkan string HTML; tombol dibedakan dengan `data-action` (`approve` / `detail` / `sim`).
- `openNodePopup()` (baris 1155–1198) membuat elemen, memasang listener per `data-action` (baris 1170–1188), lalu `new Popup(...).setDOMContent(el)`.
- Gaya popup di-override lewat `<style>` inline di JSX (baris 1851–1870), bukan di `globals.css`.

Panel overlay di dalam peta (semua `absolute`, `z-[900]`, di dalam wrapper `z-[800]`):

- `LiveOverlayControls` (kiri atas), `ForecastTimeline` (bawah tengah), `NodeDetailPanel` (kanan atas, `w-64`), `SimulationPanel` (kanan atas, `w-72`), tombol 3D/2D (kanan bawah).
- Root komponen: `<div className="relative w-full h-full min-h-[500px]">` (baris 1850).

State peta: `mapReady`, `is3D`, `overlays`, `forecastTime`, `displayLevels`, `selectedNode`, `roadSegments`, `vehicleRoutes`; ref `mapRef`, `markersRef`, `popupRef`, `nodesRef`, `latestRef` (penampung handler terbaru untuk callback peta, baris 1126–1153).

**Bagian yang tidak boleh disentuh** (dan tidak disentuh oleh rencana ini):

- `registerStaticPinImages` + `pinIconSVG` + urutan `registerStaticPinImages(mapRef).then(() => setMapReady(true))`.
- Seluruh effect inisialisasi peta (baris 1201–1533) termasuk urutan `addSource`/`addLayer`/`setTerrain`/handler klik.
- Semua effect data (segments, nodes, vehicle-routes, markers, tile theme), `latestRef`, `toggle3D`.
- Semua sub-panel yang sudah ada, blok `<style>`, class root, dan elemen `containerRef`.

### 1.3 Data persimpangan dan rekomendasi AI (shape aktual)

Sumber kebenaran: model Prisma `TrafficNode` (`prisma/schema.prisma:15`).

```ts
// shape aktual yang dipakai semua komponen (didefinisikan ulang secara lokal di tiap file)
interface TrafficNode {
  id: string;            // cuid dari DB; di /ephor/prediction berupa slug hardcoded ("ahmad-yani")
  name: string;
  lat: number;
  lng: number;
  currentLevel: number;  // 0..100 (% kemacetan)
  predicted30: number;   // 0..100
  confidence: number;    // API: 0..1 · /ephor/prediction hardcoded: 0..100 (tidak konsisten)
  recommendation: string | null; // TEKS BEBAS, bukan durasi terstruktur
}
```

Alur data:

- `GET /api/traffic-nodes` (`app/api/traffic-nodes/route.ts`) **menulis ulang DB di setiap polling**: `currentLevel` acak di sekitar `computeBaseLevel(jam)`, lalu `predictLevel()` mengisi `predicted30` (+35 dipaksa untuk demo), `confidence` 0.85–0.95, dan `recommendation`.
- `predictLevel()` (`lib/simulation/trafficModel.ts:21`) **selalu** menghasilkan salah satu dari: `"+15 detik Durasi Hijau"`, `"+10 detik Durasi Hijau"`, `"Aktifkan siklus sinyal adaptif"`, `"-10 detik Durasi Hijau"`.
- `POST /api/traffic-nodes/[id]/approve` hanya mengosongkan `recommendation` (diisi lagi pada polling berikutnya).
- `/ephor/prediction` tidak memakai API: 4 node hardcoded, rekomendasi `"Tambah durasi hijau +10 detik"` atau `null`, id tidak ada di DB.
- Seed (`prisma/seed.ts`): 12 simpang Surabaya, hanya `name/lat/lng`.

Beda dengan rencana kasar:

| Asumsi rencana | Kenyataan di repo |
|---|---|
| Ada "durasi traffic light rekomendasi AI" | **Tidak ditemukan.** Rekomendasi hanya string bebas berisi delta (`+15 detik…`) atau instruksi non-numerik |
| Ada durasi kondisi saat ini per simpang | **Tidak ditemukan.** `ephor/traffic-light/page.tsx:8` punya `initialLights` (`greenSec`/`redSec`) hardcoded di state lokal, nama simpang tidak cocok dengan seed DB; `lightPopupHTML` menulis `45s/30s` hardcoded |
| Ada fase sinyal, geometri simpang, volume, rasio belok, komposisi kendaraan | **Tidak ditemukan** di schema, route handler, maupun mock |
| Schema PostgreSQL | SQLite via Prisma |
| Route handler menyuplai input | Belum ada; harus dibuat baru |

### 1.4 Fitur "simulasi" yang sudah ada

| Yang ada | Lokasi | Kondisi | Bisa dipakai ulang? |
|---|---|---|---|
| `SimulationPanel` + `SCENARIOS` (+5/+10/+15 dtk, alih arus) | `DigitalTwinMapInner.tsx:81–117, 719–894` | Angka persen tetap + `setTimeout` 1,2 dtk. Hanya tampil saat `activeTab === "simulation"`, dan **tidak ada halaman yang mengirim tab itu** (praktis tidak terjangkau) | Hanya sebagai acuan gaya baris "sebelum → sesudah + badge %". Tidak diubah |
| Halaman `/ephor/simulation` | `app/(dashboard)/ephor/simulation/page.tsx` | Form statis (volume, cuaca), tombol `alert()`. Tidak ada di `Sidebar` | Tidak. Tidak diubah |
| Model mock server | `lib/simulation/{trafficModel,incidentGenerator,vanguardSimulator}.ts` | Dipakai route handler | Hanya sebagai sumber daftar string rekomendasi untuk parser. Tidak diubah |
| `SimulationLog` | `prisma/schema.prisma:54` | Tidak dipakai kode mana pun | Tidak dipakai di fitur ini |
| `buildAiReasoning` | `components/dashboard/AiRecommendationPanel.tsx:23` | Angka turunan untuk tampilan | Tidak dipakai (bukan data) |

Simulasi mikroskopik, 3D, IDM, atau controller sinyal: **tidak ditemukan**. Semuanya baru.

### 1.5 Konvensi

- Penamaan: komponen `PascalCase.tsx` di `components/<area>/` (`dashboard`, `layout`, `ui`); hook di `lib/hooks/useX.ts` (alias `@/hooks` di `components.json` tidak dipakai); service di `lib/services/`; route handler `app/api/<resource>/route.ts`.
- Semua halaman dan komponen dashboard adalah Client Component (`'use client'`). Pustaka berat dimuat dengan `next/dynamic` + `ssr: false` dari Client Component.
- Tipe domain tidak dibagikan: `TrafficNode` disalin lokal di tiap file. Tidak ada folder `types/`.
- Route handler: `NextResponse.json(...)`, `params` berupa `Promise` yang di-`await` (`approve/route.ts:4`), validasi `zod` (`app/api/incidents/route.ts`), error `{ error: string }` + status.
- Gaya kode campur: file terbaru (`DigitalTwinMapInner.tsx`, `prediction/page.tsx`) memakai kutip ganda + titik koma (gaya Prettier); file lama kutip tunggal tanpa titik koma. Line ending file peta: LF.
- Komponen UI bersama: `Button`, `Card*`, `Badge`, `Tabs*`, `Dialog*`, `Progress` (`components/ui/`). `Tabs` berbasis base-ui: state aktif memakai `data-active:` (bukan `data-[state=active]:`).
- Token (`app/globals.css`): `--primary #8F1610` (maroon), `--color-sparta-gold #E48E07`, status lalu lintas `#DC2626 / #F97316 / #EAB308 / #16A34A / #2563EB`, netral `#111827 / #6B7280 / #e5e7eb / #f3f4f6`, `--radius 0.75rem`, font Plus Jakarta Sans. Light mode saja. Tidak ada pane/z-index di `globals.css`.
- `DESIGN.md` melarang: dark mode, glassmorphism, neon, HUD futuristik, widget mengambang, **animasi auto-play**; mewajibkan fokus keyboard terlihat, hormati `prefers-reduced-motion`, dan data demo diberi label jelas (`PRODUCT.md` prinsip 4).
- z-index yang dipakai: overlay peta `z-[800]`/`z-[900]`; `components/ui/dialog.tsx` `z-50`; halaman CCTV `z-[9999]`. Overlay peta tidak berada dalam stacking context sendiri, jadi secara efektif berada **di atas** Dialog bersama (`z-50`).

### 1.6 Dependency

Sudah ada dan relevan: `next`, `react`, `swr`, `zod`, `lucide-react`, `recharts`, `@base-ui/react`, `tw-animate-css`, `clsx` + `tailwind-merge` (`cn` di `lib/utils.ts`).

Belum ada (dicek di `node_modules`): `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`.

---

## 2. Verifikasi kelayakan 3D

Dicek ke registry npm pada 2026-10-08 (tanpa memasang apa pun):

| Paket | Versi terbaru | Peer dependency | Cocok dengan repo? |
|---|---|---|---|
| `three` | `0.186.1` | tidak ada | Ya. Tidak membawa tipe sendiri → perlu `@types/three` (`0.186.0`) |
| `@react-three/fiber` | `9.8.1` | `react >=19 <19.4`, `react-dom >=19 <19.4`, `three >=0.156` | Ya (`react 19.2.4`) |
| `@react-three/drei` | `10.7.9` | `react ^19`, `react-dom ^19`, `three >=0.159`, `@react-three/fiber ^9` | Ya |

Catatan kelayakan:

- `next/dynamic` dengan `ssr: false` hanya boleh di Client Component (`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`). `DigitalTwinMapInner.tsx` sudah `"use client"` dan sudah dimuat `ssr:false`, jadi aman.
- `@react-three/drei` tidak termasuk daftar bawaan `optimizePackageImports` Next (dicek di `node_modules/next/dist/server/config.js`). Impor hanya yang dipakai (`OrbitControls`) dan periksa ukuran chunk saat build; kalau membengkak, ganti dengan `OrbitControls` dari `three/examples/jsm/controls/OrbitControls.js`.
- Tidak ada `reactStrictMode` di `next.config.ts` → default App Router aktif, effect dijalankan dua kali di dev. Loop `requestAnimationFrame` dan inisialisasi engine harus punya cleanup yang benar.
- React Compiler tidak diaktifkan (tidak ada `reactCompiler` / `babel-plugin-react-compiler`), tetapi aturan lint-nya aktif.
- **Belum diverifikasi saat runtime**: kecocokan peer hanya dibaca dari metadata registry karena pemasangan dilarang di tugas ini. Verifikasi nyata (build + render satu `<Canvas>`) menjadi isi Tahap 0 dan Tahap 5.

Kesimpulan: layak. Tidak ada konflik versi yang terlihat.

---

## 3. Penyesuaian terhadap rencana kasar

| # | Rencana kasar | Penyesuaian | Alasan |
|---|---|---|---|
| 1 | Klik marker langsung membuka panel | Klik pin tetap membuka popup yang sudah ada; ditambah **satu tombol** `Simulasi 3D Simpang` di popup itu | Pin adalah layer simbol dengan handler klik yang sudah punya efek samping (approve otomatis di tab Live). Menambah aksi di popup adalah perubahan paling kecil dan tidak mengubah alur klik |
| 2 | Panel simulasi (bentuk bebas) | Panel menutupi **area peta saja** (`absolute inset-0 z-[1000]` di dalam root peta), bukan `Dialog` | Dialog bersama `z-50` akan tertutup overlay peta `z-[900]`; memperbaikinya butuh mengubah file existing. Overlay di dalam root peta tidak butuh portal, tidak menyentuh layout halaman, sidebar tetap terlihat |
| 3 | Input = durasi AI dari data yang ada | Input dibangun oleh **adapter**: string rekomendasi di-parse jadi delta detik; rencana sinyal eksisting, geometri, volume, rasio belok, komposisi kendaraan = **mock deterministik** berlabel "data demo" | Data terstruktur tidak ada di repo (lihat 1.3) |
| 4 | Route handler menyuplai input | `GET /api/traffic-nodes/[id]/simulation` menerima **snapshot node dari client** lewat query, DB hanya dibaca (opsional) dan tidak pernah ditulis | (a) Klik pin di `/ephor` tab Live langsung meng-approve sehingga `recommendation` di DB sudah `null` saat panel dibuka; (b) node `/ephor/prediction` tidak ada di DB; (c) `GET /api/traffic-nodes` mengacak level tiap 5 dtk |
| 5 | Fase green/yellow/all-red | Dipertahankan, dengan **fase per pendekat** (4 fase: U, T, S, B) dan **lajur kiri** (Indonesia) | Hanya satu pendekat hijau pada satu waktu → tidak perlu resolusi konflik di dalam simpang; engine jauh lebih sederhana dan tetap masuk akal |
| 6 | Seeded RNG | Ditambah **common random numbers**: aliran kedatangan per pendekat di-seed terpisah dari dinamika, sehingga dua varian menerima kedatangan identik | Tanpa ini mode Bandingkan membandingkan noise, bukan durasi sinyal |
| 7 | Engine di `lib/sim/` | Dipertahankan. Catatan: `lib/simulation/` sudah ada (mock server) dan tidak disentuh | Menghindari campur aduk dengan modul server yang mengakses Prisma |
| 8 | Posisi kendaraan di ref | Dipertahankan; ditambah: metrik/jam simulasi dipublikasikan ke React state **≤ 4 Hz** dari callback rAF | Aturan lint `react-hooks/refs` dan `set-state-in-effect` aktif; render 60 Hz lewat state tidak perlu |
| 9 | Kontrol play-pause-reset-kecepatan | Dipertahankan; simulasi **mulai dalam keadaan jeda** | `DESIGN.md` melarang animasi auto-play dan mewajibkan hormat pada reduced motion |
| 10 | Tab Bandingkan | Dua `<Canvas>` berdampingan, satu jam simulasi bersama, seed sama | Paling sederhana dan terisolasi; total 3 konteks WebGL (termasuk MapLibre) masih aman |
| 11 | (tidak disebut) test | `bun test` untuk `lib/sim` | Tidak ada test runner; Bun sudah jadi runtime proyek sehingga tidak perlu framework baru |
| 12 | (tidak disebut) tombol "Terapkan" | **Tidak ada** aksi approve/terapkan di panel baru | Panel adalah simulasi, bukan kontrol sinyal; alur approve yang ada tidak diubah |

---

## 4. Daftar file

### 4.1 File baru

Engine (TypeScript murni, tanpa React/DOM/three):

| File | Isi |
|---|---|
| `lib/sim/types.ts` | Semua tipe di bagian 5 |
| `lib/sim/rng.ts` | `fnv1a(str)`, `mulberry32(seed)`, `deriveSeed(seed, label)` |
| `lib/sim/recommendation.ts` | `parseRecommendation(raw)` |
| `lib/sim/adapter.ts` | `buildSimInput(snapshot, opts)` + konstanta mock |
| `lib/sim/signal.ts` | Controller fase: `signalAt(plan, tSec)`, `colorFor(approach, …)` |
| `lib/sim/idm.ts` | Percepatan IDM + parameter per jenis kendaraan |
| `lib/sim/engine.ts` | `createSim(input, planId)`, `stepSim(state, dt)`, `resetSim` |
| `lib/sim/metrics.ts` | Antrean, tundaan, throughput, snapshot metrik |
| `lib/sim/__tests__/*.test.ts` | Test `bun:test` (determinisme, konservasi kendaraan, siklus sinyal, tanpa tabrakan, parser, adapter) |

Server:

| File | Isi |
|---|---|
| `app/api/traffic-nodes/[id]/simulation/route.ts` | `GET` → `IntersectionSimInput` (read-only) |

Client:

| File | Isi |
|---|---|
| `lib/hooks/useIntersectionSim.ts` | Fetch input (SWR) + loop rAF fixed-timestep + snapshot metrik ter-throttle |
| `components/sim/IntersectionSimPanel.tsx` | **default export**; kerangka panel, tab, state loading/error/kosong, disclaimer |
| `components/sim/SimControls.tsx` | Play/pause, reset, kecepatan, jam simulasi |
| `components/sim/PhaseDiagram.tsx` | Diagram fase per rencana + penanda waktu siklus |
| `components/sim/MetricCards.tsx` | Kartu metrik + selisih di mode Bandingkan |
| `components/sim/IntersectionScene.tsx` | `<Canvas>` + kamera + lampu + komposisi scene |
| `components/sim/scene/RoadGeometry.tsx` | Tanah, badan jalan, marka, garis henti |
| `components/sim/scene/SignalHeads.tsx` | Tiang + lampu, warna diubah di `useFrame` |
| `components/sim/scene/VehicleInstances.tsx` | 4 `InstancedMesh` (motor, mobil, bus, truk) |

### 4.2 Perubahan pada file existing

**Hanya satu file kode aplikasi yang disentuh: `components/dashboard/DigitalTwinMapInner.tsx`. Enam sisipan, total +24 baris (termasuk 2 baris kosong), 0 baris dihapus, 0 baris diubah.**

Sisipan A — impor (setelah baris 27, jangkar `import { OSRMRoutingService }`):

```diff
 import { OSRMRoutingService } from "@/lib/services/osrm-routing";
+import dynamic from "next/dynamic";
```

Sisipan B — komponen lazy tingkat modul (setelah baris 123, jangkar `const osrm = new OSRMRoutingService();`):

```diff
 const osrm = new OSRMRoutingService();
+
+// ─── Panel simulasi 3D simpang (lazy, client-only) ──────────────────────────
+const IntersectionSimPanel = dynamic(
+  () => import("@/components/sim/IntersectionSimPanel"),
+  { ssr: false },
+);
```

Sisipan C — satu tombol baru di popup, fungsi `nodePopupHTML` (setelah baris 422, jangkar `<div style="display:flex;gap:8px">${buttons}</div>`):

```diff
         <div style="display:flex;gap:8px">${buttons}</div>
+        <button data-action="sim3d" style="width:100%;padding:8px 0;border:none;cursor:pointer;border-radius:10px;font-size:12px;font-weight:700;background:rgba(255,255,255,0.1);color:white">Simulasi 3D Simpang</button>
```

Tombol menjadi anak baru dari kolom flex `gap:12px` yang sudah ada, di baris tersendiri, dengan gaya sama persis seperti tombol `Detail`. Tombol lama tidak berubah lebar, teks, maupun urutannya.

Sisipan D — satu state, komponen `DigitalTwinMapInner` (setelah baris 928, jangkar `const [selectedNode, setSelectedNode]`):

```diff
   const [selectedNode, setSelectedNode] = useState<TrafficNode | null>(null);
+  const [sim3dNode, setSim3dNode] = useState<TrafficNode | null>(null);
```

Sisipan E — satu listener, fungsi `openNodePopup` (setelah baris 1188, tepat sesudah listener `[data-action="sim"]`):

```diff
     el.querySelector('[data-action="sim"]')?.addEventListener("click", () => {
       latestRef.current.setSelectedNode(node);
       popupRef.current?.remove();
     });
+    el.querySelector('[data-action="sim3d"]')?.addEventListener(
+      "click",
+      () => {
+        setSim3dNode(node);
+        popupRef.current?.remove();
+      },
+    );
```

`setSim3dNode` adalah setter state (identitas stabil), jadi aman dipanggil dari closure `openNodePopup` yang ditangkap effect inisialisasi peta. `latestRef` tidak perlu diubah.

Sisipan F — render panel, JSX return (setelah baris 1919, sesudah `</button>` tombol 3D/2D, sebelum komentar `MapLibre GL map — single ref`):

```diff
         {is3D ? "3D ON" : "3D OFF"}
       </button>
 
+      {/* Panel simulasi 3D simpang — hanya di-mount saat dibuka */}
+      {sim3dNode && (
+        <IntersectionSimPanel
+          node={sim3dNode}
+          onClose={() => setSim3dNode(null)}
+        />
+      )}
+
       {/* MapLibre GL map — single ref, must be the only element with containerRef */}
```

Bukti bahwa UI existing tidak berubah saat simulasi tidak dibuka:

- `sim3dNode` awalnya `null` → tidak ada node DOM tambahan, dan chunk `three` tidak diunduh sampai tombol diklik.
- Tidak ada baris existing yang dihapus atau diubah; tidak ada class, style, urutan layer, atau effect yang disentuh.
- Satu-satunya perbedaan visual: popup pin punya satu baris tombol tambahan (sekitar 43 px lebih tinggi). Ini memang aksi baru yang diminta.
- `DigitalTwinMap.tsx`, ketiga halaman pemakai, `globals.css`, `Sidebar`, layout: **tidak diubah**.

File non-UI yang ikut berubah karena pemasangan dependency:

| File | Perubahan |
|---|---|
| `package.json` | `dependencies`: `three`, `@react-three/fiber`, `@react-three/drei`; `devDependencies`: `@types/three`, `@types/bun` |
| `bun.lock` | diperbarui oleh `bun add` |
| `package-lock.json` | **menjadi tidak sinkron** kecuali diperbarui manual (lihat pertanyaan terbuka 2) |

`app/globals.css`: tidak diubah. Semua gaya baru memakai utility Tailwind dan token yang ada.

---

## 5. Tipe data final dan adapter

### 5.1 Tipe (`lib/sim/types.ts`)

```ts
export type ApproachId = "N" | "E" | "S" | "W"; // label UI: Utara, Timur, Selatan, Barat
export type Movement = "left" | "through" | "right";
export type VehicleType = "motor" | "mobil" | "bus" | "truk";
export type SignalColor = "green" | "yellow" | "red";
export type PlanId = "current" | "ai";

/** Sama persis dengan TrafficNode lokal di DigitalTwinMapInner.tsx (kompatibel struktural). */
export interface TrafficNodeSnapshot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  currentLevel: number; // 0..100
  predicted30: number;  // 0..100
  confidence: number;   // 0..1 dari API, 0..100 dari /ephor/prediction
  recommendation: string | null;
}

export type ParsedRecommendation =
  | { kind: "green-delta"; deltaSec: number; raw: string }
  | { kind: "adaptive"; raw: string }
  | { kind: "unparsed"; raw: string }
  | { kind: "none"; raw: null };

export interface ApproachSpec {
  id: ApproachId;
  label: string;
  lanes: number;                         // lajur masuk
  demandVph: number;                     // kendaraan/jam
  turnRatio: Record<Movement, number>;   // jumlah = 1
}

export interface PhaseSpec {
  id: string;                // "P-N"
  label: string;             // "Utara"
  approaches: ApproachId[];  // pendekat yang hijau
  greenSec: number;
  yellowSec: number;
  allRedSec: number;
}

export interface SignalPlan {
  id: PlanId;
  label: string;             // "Kondisi Saat Ini" | "Rekomendasi AI"
  phases: PhaseSpec[];
  cycleSec: number;          // Σ(green + yellow + allRed)
}

export interface IntersectionSimInput {
  node: TrafficNodeSnapshot; // confidence sudah dinormalkan ke 0..1
  recommendation: ParsedRecommendation;
  geometry: {
    driveSide: "left";
    laneWidthM: number;       // 3.2
    approachLengthM: number;  // 120
    approaches: ApproachSpec[];
  };
  vehicleMix: Record<VehicleType, number>; // jumlah = 1
  plans: { current: SignalPlan; ai: SignalPlan | null };
  criticalApproach: ApproachId;
  seed: number;
  meta: {
    source: "db+snapshot" | "snapshot";
    mocked: string[];         // nama bagian yang mock, ditampilkan di disclaimer
    generatedAt: string;      // ISO
  };
}

export interface SimMetrics {
  simTimeSec: number;
  queueNow: number;          // kendaraan v < 5 km/jam di hulu garis henti + backlog
  queueAvg: number;
  queueMax: number;
  delayAvgSec: number;       // tundaan rata-rata per kendaraan yang keluar
  throughputVph: number;     // kendaraan melewati garis henti per jam
  spawned: number;
  exited: number;
  perApproach: Record<ApproachId, { queueNow: number; queueMax: number; exited: number }>;
}
```

### 5.2 Adapter (`lib/sim/adapter.ts` + `lib/sim/recommendation.ts`)

Dari data AI yang **benar-benar ada**:

| Sumber | Dipakai untuk | Aturan |
|---|---|---|
| `recommendation` | `ParsedRecommendation` | `/([+\-−])\s*(\d{1,3})\s*(?:detik|dtk|s)\b/i` → `green-delta` bertanda; `/adaptif/i` → `adaptive`; `null`/kosong → `none`; lainnya → `unparsed` |
| `currentLevel` | Volume kedatangan | Derajat kejenuhan `X = clamp(0.30 + 0.75·level/100, 0.30, 1.05)`; `demandVph_i = X · kapasitas_i · w_i` |
| `confidence` | Tampilan saja | `c > 1 ? c/100 : c` |
| `id` | Seed | `seed = fnv1a(id)` |
| `name`, `lat`, `lng`, `predicted30` | Judul dan konteks panel | apa adanya |

String rekomendasi yang ada di repo dan hasil parse-nya:

| String | Hasil |
|---|---|
| `+15 detik Durasi Hijau` | `green-delta +15` |
| `+10 detik Durasi Hijau` | `green-delta +10` |
| `-10 detik Durasi Hijau` | `green-delta −10` |
| `Tambah durasi hijau +10 detik` | `green-delta +10` |
| `Aktifkan siklus sinyal adaptif` | `adaptive` |
| `null` | `none` → tab Rekomendasi AI dan Bandingkan nonaktif dengan penjelasan |

Rencana sinyal AI:

- `green-delta`: `greenSec` fase pendekat kritis `+= deltaSec`, dijepit ke `[10, 90]`; fase lain tetap; `cycleSec` dihitung ulang.
- `adaptive`: panjang siklus tetap; total hijau dibagi ulang sebanding `demandVph_i / (1800 · lanes_i)`, minimum 10 dtk per fase.
- `unparsed` / `none`: `plans.ai = null`.

**Bagian yang harus mock** (deterministik dari `seed`, dicatat di `meta.mocked`, ditampilkan sebagai "data demo"):

| Bagian | Nilai mock |
|---|---|
| Rencana sinyal eksisting | 4 fase per pendekat (U→T→S→B); hijau sumbu mayor 35–45 dtk, minor 22–30 dtk; kuning 3; all-red 2 |
| Geometri | Simpang 4 lengan tegak lurus; mayor 3 lajur, minor 2 lajur; lebar lajur 3,2 m; panjang pendekat 120 m |
| Arus jenuh | 1800 kend/jam/lajur (konstanta) |
| Bobot volume per pendekat | `w_i ∈ [0.85, 1.15]` |
| Rasio belok | kiri 0,20 · lurus 0,60 · kanan 0,20 (±0,05) |
| Komposisi kendaraan | motor 0,60 · mobil 0,32 · bus 0,03 · truk 0,05 |
| Pendekat yang menerima tambahan hijau | pendekat dengan `demand/kapasitas` tertinggi (string rekomendasi tidak menyebut pendekat) |

### 5.3 Route handler

`GET /api/traffic-nodes/[id]/simulation?name=&lat=&lng=&currentLevel=&predicted30=&confidence=&recommendation=`

1. `const { id } = await params` (pola `approve/route.ts`).
2. Validasi query dengan `zod` (`z.coerce.number()`, semua opsional).
3. `prisma.trafficNode.findUnique({ where: { id } })` — **hanya baca**. Tidak memanggil `maybeGenerateIncident`, tidak ada `update`.
4. `snapshot = { ...barisDb, ...fieldQueryYangAda }`; kalau tidak ada baris DB dan query tidak memuat minimal `name` + `currentLevel` → `404 { error: 'Node not found' }`.
5. `NextResponse.json(buildSimInput(snapshot, { source }))`.

---

## 6. Urutan implementasi

Tiap tahap berdiri sendiri dan punya cara uji sendiri.

| Tahap | Isi | Cara uji |
|---|---|---|
| 0. Baseline + dependency | Simpan salinan `DigitalTwinMapInner.tsx` dan `git status --short` ke direktori sementara di luar repo. `bun add three @react-three/fiber @react-three/drei`, `bun add -d @types/three @types/bun` | `bunx tsc --noEmit --incremental false` lolos; `bunx eslint app components lib` tetap 6 error / 33 warning; `bun run build` lolos |
| 1. Engine headless | `types`, `rng`, `signal`, `idm`, `engine`, `metrics` + test | `bun test lib/sim`: seed sama → metrik identik; `spawned = aktif + exited + backlog`; jarak antar kendaraan ≥ 0; siklus sinyal = Σ fase; arus jenuh hasil simulasi 1500–2400 kend/jam/lajur |
| 2. Adapter + route | `recommendation`, `adapter`, route handler + test | `bun test`; `curl "http://localhost:3000/api/traffic-nodes/x/simulation?name=Tes&currentLevel=71&recommendation=%2B15%20detik%20Durasi%20Hijau"` mengembalikan dua rencana; tanpa query pada id tak dikenal → 404; jumlah baris DB dan nilai `recommendation` tidak berubah |
| 3. Kerangka panel + sisipan | `IntersectionSimPanel` (header, tab, loading/error/kosong, disclaimer, tutup) + enam sisipan di 4.2 | Di `/ephor`, `/ephor/live-map`, `/ephor/prediction`: tombol muncul di popup, panel terbuka/tertutup (tombol dan Esc); `git diff --no-index <baseline> DigitalTwinMapInner.tsx` hanya berisi penambahan |
| 4. Runner + UI 2D | `useIntersectionSim`, `SimControls`, `PhaseDiagram`, `MetricCards` | Play/jeda/reset/kecepatan bekerja; metrik bergerak; reset mengembalikan angka yang sama (deterministik); tab berpindah tanpa error |
| 5. Scene 3D | `IntersectionScene` + `scene/*` | Kendaraan berhenti di garis henti saat merah, berjalan saat hijau, lajur kiri; lampu sinkron dengan diagram fase; 60 fps pada kecepatan 8×; tutup panel → tidak ada rAF/konteks WebGL tersisa |
| 6. Mode Bandingkan | Dua scene, satu jam, kedatangan identik, selisih metrik | Jumlah `spawned` kedua varian sama di waktu yang sama; selisih tampil dengan tanda dan warna yang benar |
| 7. Pengerasan + regresi | Fallback tanpa WebGL, `prefers-reduced-motion`, fokus keyboard, tinggi 560 px (`/ephor/prediction`), bukti diff | Lint/tsc/build sama dengan baseline; daftar periksa manual 3 halaman dengan panel tertutup identik dengan sebelum perubahan |

---

## 7. Risiko dan pertanyaan terbuka

1. **Working tree belum di-commit.** 11 file berubah (termasuk file peta, diff ~2000 baris). Nomor baris di dokumen ini mengacu ke working tree, dan pembuktian "hanya penambahan" tidak bisa memakai `git diff` terhadap HEAD. Usul: commit dulu sebelum implementasi; kalau tidak, pakai salinan baseline + `git diff --no-index` (sudah masuk Tahap 0).
2. **Lockfile ganda.** `bun.lock` dan `package-lock.json` sama-sama ter-track. Rencana memakai Bun (sesuai README). Perlu keputusan: perbarui juga `package-lock.json` (`npm install --package-lock-only`), atau biarkan/hapus?
3. **Semantik rekomendasi tidak lengkap.** String `"+15 detik Durasi Hijau"` tidak menyebut pendekat, dan durasi eksisting tidak ada di repo. Rencana: tambahan hijau diberikan ke pendekat terpadat dan siklus ikut memanjang. Karena engine jujur, hasil **bisa menunjukkan rekomendasi AI tidak lebih baik**; parameter tidak boleh diatur supaya AI "menang". Apakah asumsi ini diterima, atau siklus harus tetap (hijau diambil dari fase lain)?
4. **Perilaku existing: klik pin di `/ephor` tab Live langsung meng-approve** rekomendasi (baris 1491–1493) sebelum popup muncul. Tidak diubah oleh rencana ini; panel memakai snapshot saat klik agar rekomendasi tetap tersedia. Operator akan melihat simulasi untuk rekomendasi yang baru saja ter-approve. Apakah ini memang diinginkan (di luar lingkup fitur ini)?
5. **Lapisan z-index dan WebGL.** Panel `z-[1000]` berada di atas Dialog bersama (`z-50`), sama seperti overlay peta sekarang; Dialog rute Vanguard di `/ephor` akan tertutup bila dibuka saat panel aktif. Mode Bandingkan memakai 3 konteks WebGL sekaligus (MapLibre + 2 canvas); kalau perangkat ruang kendali lemah, fallback-nya satu canvas dengan dua simpang berdampingan. Kecocokan `three`/R3F dengan Turbopack Next 16 baru terbukti setelah Tahap 0/5.
