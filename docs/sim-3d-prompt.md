# Prompt Implementasi: Simulasi 3D Persimpangan di SPARTA-Ephor

Kamu bekerja di repo SPARTA Ephor Dashboard: dashboard pusat kendali lalu lintas Surabaya untuk operator ATCS. Tugasmu menambahkan satu fitur: dari popup pin persimpangan di peta Digital Twin, operator membuka panel simulasi 3D persimpangan (motor, mobil, bus, truk) yang menjalankan durasi lampu rekomendasi AI, dengan mode bandingkan terhadap durasi kondisi saat ini. Simulasi berjalan di client; input disuplai route handler Next.js.

Latar belakang dan alasan tiap keputusan ada di `docs/sim-3d-plan.md`. Prompt ini sudah lengkap tanpa file itu; baca hanya kalau butuh alasan di balik suatu keputusan.

## 1. Aturan wajib

Operator memakai dashboard ini saat bertugas, dan tampilan yang ada sudah disetujui. Fitur ini harus terasa sebagai tambahan, bukan perombakan.

1. **Jangan mengubah UI yang sudah ada** dalam bentuk apa pun: layout, warna, spacing, komponen, sidebar, halaman, styling global, perilaku peta/pin/CCTV. Tidak ada refactor, rename, restyle, format ulang, atau perapian di kode existing, termasuk memperbaiki error lint lama.
2. **Satu-satunya file kode existing yang boleh diedit adalah `components/dashboard/DigitalTwinMapInner.tsx`**, dan hanya dengan enam sisipan di bagian 5. Tidak ada baris yang dihapus atau diubah. `package.json` dan lockfile berubah hanya karena pemasangan dependency.
3. Jangan menyentuh `registerStaticPinImages`, `pinIconSVG`, urutan `registerStaticPinImages(mapRef).then(() => setMapReady(true))`, effect inisialisasi peta, urutan `addSource`/`addLayer`, handler klik `nodes-layer`, `latestRef`, atau effect data mana pun.
4. Seluruh UI baru ada di file baru dan memakai token, komponen UI bersama, dan konvensi repo. Jangan mengubah `app/globals.css`; pakai utility Tailwind v4 dan token yang ada.
5. Saat panel tidak dibuka, semua halaman harus tampil dan berperilaku identik dengan sebelumnya. Chunk `three` tidak boleh ikut termuat sebelum tombol diklik.
6. Jangan menulis ke database dan jangan memanggil endpoint approve dari fitur ini. Panel tidak punya tombol "Terapkan/Approve".
7. Jangan mengatur parameter supaya rekomendasi AI terlihat lebih baik. Kalau simulasi menunjukkan hasil AI lebih buruk, tampilkan apa adanya.
8. Kalau sesuatu di repo ternyata berbeda dari prompt ini, berhenti di titik itu dan laporkan, jangan menebak.

## 2. Baca dulu

`AGENTS.md` mewajibkan membaca panduan Next versi repo ini sebelum menulis kode, karena API-nya berbeda dari versi yang umum dikenal:

- `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` (`next/dynamic`, `ssr: false` hanya di Client Component)
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (`params` berupa Promise)
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`

Lalu baca `DESIGN.md`, `PRODUCT.md`, `app/globals.css`, `components/ui/{button,card,badge,tabs}.tsx`, dan `components/dashboard/DigitalTwinMapInner.tsx` seluruhnya.

## 3. Fakta codebase

- Next `16.2.10` App Router, React `19.2.4`, TypeScript `5.9` strict, Tailwind v4 tanpa config (token di `app/globals.css`), shadcn `base-nova` di atas `@base-ui/react`, ikon `lucide-react`, `swr`, `zod`, `recharts`, Prisma 6 + SQLite. Package manager: **Bun**. Alias `@/*` → root repo.
- Peta: `maplibre-gl 6.1.0` di `components/dashboard/DigitalTwinMapInner.tsx` (`"use client"`, sudah dimuat `ssr:false`). Dipakai oleh `/ephor`, `/ephor/live-map`, `/ephor/prediction`.
- Pin persimpangan adalah layer simbol `nodes-layer`, bukan Marker DOM. Klik pin membuka popup HTML dari `nodePopupHTML()`; listener tombol dipasang di `openNodePopup()` berdasarkan atribut `data-action`.
- Shape node yang ada (disalin lokal di tiap file, tidak ada tipe bersama):

```ts
interface TrafficNode {
  id: string; name: string; lat: number; lng: number;
  currentLevel: number;          // 0..100
  predicted30: number;           // 0..100
  confidence: number;            // 0..1 dari API; 0..100 di /ephor/prediction
  recommendation: string | null; // teks bebas
}
```

- Nilai `recommendation` yang ada di repo: `"+15 detik Durasi Hijau"`, `"+10 detik Durasi Hijau"`, `"-10 detik Durasi Hijau"`, `"Aktifkan siklus sinyal adaptif"` (`lib/simulation/trafficModel.ts`), `"Tambah durasi hijau +10 detik"` atau `null` (`app/(dashboard)/ephor/prediction/page.tsx`).
- **Tidak ada** di repo: durasi fase sinyal, geometri simpang, volume kendaraan, rasio belok, komposisi kendaraan. Semua itu mock deterministik dan wajib diberi label data demo.
- `GET /api/traffic-nodes` menulis ulang DB tiap polling 5 dtk, dan klik pin di `/ephor` tab Live langsung meng-approve rekomendasi. Karena itu input simulasi memakai **snapshot node dari client**, bukan baca ulang dari DB.
- Node di `/ephor/prediction` hardcoded dan tidak ada di DB.
- `lib/simulation/` sudah ada (mock server). Jangan diubah; engine baru ada di `lib/sim/`.
- Overlay peta memakai `z-[800]`/`z-[900]`. Dialog bersama (`components/ui/dialog.tsx`) `z-50` akan tertutup overlay itu, jadi panel **tidak** memakai Dialog.
- `components/ui/tabs.tsx` berbasis base-ui: state aktif memakai varian `data-active:`.
- Lint: `eslint-plugin-react-hooks 7` dengan aturan `set-state-in-effect`, `purity`, `refs` aktif. Jangan baca `ref.current` saat render, jangan `setState` sinkron di badan effect, jangan `Math.random()`/`Date.now()` saat render.
- Baseline: `bunx tsc --noEmit --incremental false` lolos; `bunx eslint app components lib` = 6 error + 33 warning lama; file peta bersih (0/0).
- Working tree mungkin punya perubahan belum di-commit. Nomor baris di bawah mengacu ke file peta setebal 1925 baris; kalau bergeser, pakai string jangkarnya.

## 4. Dependency

> Koreksi setelah implementasi: jangan pakai `bun add` di repo ini. `bun.lock` basi (tidak memuat `maplibre-gl`) sehingga Bun akan menaikkan versi peta. Pakai `npm install three @react-three/fiber @react-three/drei` dan `npm install -D @types/three @types/bun`. Lihat "Catatan implementasi" di `docs/sim-3d-plan.md`.

```bash
bun add three @react-three/fiber @react-three/drei
bun add -d @types/three @types/bun
```

Sudah dicek: `@react-three/fiber 9.8.1` (peer `react >=19 <19.4`), `@react-three/drei 10.7.9` (peer `react ^19`, `fiber ^9`), `three 0.186.1`. Dari drei impor `OrbitControls` saja. Jangan menambah dependency lain.

## 5. Perubahan pada `components/dashboard/DigitalTwinMapInner.tsx`

Enam sisipan, +24 baris (termasuk 2 baris kosong), 0 baris dihapus. Pertahankan LF, kutip ganda, titik koma.

A. Setelah `import { OSRMRoutingService } from "@/lib/services/osrm-routing";` (baris 27):

```ts
import dynamic from "next/dynamic";
```

B. Setelah `const osrm = new OSRMRoutingService();` (baris 123):

```ts

// ─── Panel simulasi 3D simpang (lazy, client-only) ──────────────────────────
const IntersectionSimPanel = dynamic(
  () => import("@/components/sim/IntersectionSimPanel"),
  { ssr: false },
);
```

C. Di `nodePopupHTML`, baris baru tepat setelah `<div style="display:flex;gap:8px">${buttons}</div>` (baris 422):

```html
        <button data-action="sim3d" style="width:100%;padding:8px 0;border:none;cursor:pointer;border-radius:10px;font-size:12px;font-weight:700;background:rgba(255,255,255,0.1);color:white">Simulasi 3D Simpang</button>
```

D. Setelah `const [selectedNode, setSelectedNode] = useState<TrafficNode | null>(null);` (baris 928):

```ts
  const [sim3dNode, setSim3dNode] = useState<TrafficNode | null>(null);
```

E. Di `openNodePopup`, setelah blok listener `[data-action="sim"]` (berakhir di baris 1188):

```ts
    el.querySelector('[data-action="sim3d"]')?.addEventListener(
      "click",
      () => {
        setSim3dNode(node);
        popupRef.current?.remove();
      },
    );
```

F. Di JSX return, setelah `</button>` tombol 3D/2D (baris 1919), sebelum komentar `MapLibre GL map — single ref`:

```tsx
      {/* Panel simulasi 3D simpang — hanya di-mount saat dibuka */}
      {sim3dNode && (
        <IntersectionSimPanel
          node={sim3dNode}
          onClose={() => setSim3dNode(null)}
        />
      )}

```

## 6. File baru

```
lib/sim/types.ts            tipe (bagian 7)
lib/sim/rng.ts              fnv1a, mulberry32, deriveSeed(seed, label)
lib/sim/recommendation.ts   parseRecommendation
lib/sim/adapter.ts          buildSimInput + konstanta mock
lib/sim/signal.ts           controller fase
lib/sim/idm.ts              car-following IDM + parameter per jenis
lib/sim/engine.ts           createSim, stepSim, resetSim
lib/sim/metrics.ts          antrean, tundaan, throughput
lib/sim/__tests__/*.test.ts test dengan bun:test
app/api/traffic-nodes/[id]/simulation/route.ts
lib/hooks/useIntersectionSim.ts
components/sim/IntersectionSimPanel.tsx   (default export, "use client")
components/sim/SimControls.tsx
components/sim/PhaseDiagram.tsx
components/sim/MetricCards.tsx
components/sim/IntersectionScene.tsx
components/sim/scene/RoadGeometry.tsx
components/sim/scene/SignalHeads.tsx
components/sim/scene/VehicleInstances.tsx
```

`lib/sim/*` adalah TypeScript murni: tanpa React, DOM, three, Prisma, `Math.random`, atau `Date.now`, supaya bisa dites headless dan dipakai server maupun client. Gaya file baru: kutip ganda, titik koma, indent 2 spasi.

## 7. Tipe (`lib/sim/types.ts`)

```ts
export type ApproachId = "N" | "E" | "S" | "W"; // UI: Utara, Timur, Selatan, Barat
export type Movement = "left" | "through" | "right";
export type VehicleType = "motor" | "mobil" | "bus" | "truk";
export type SignalColor = "green" | "yellow" | "red";
export type PlanId = "current" | "ai";

export interface TrafficNodeSnapshot {
  id: string; name: string; lat: number; lng: number;
  currentLevel: number; predicted30: number; confidence: number;
  recommendation: string | null;
}

export type ParsedRecommendation =
  | { kind: "green-delta"; deltaSec: number; raw: string }
  | { kind: "adaptive"; raw: string }
  | { kind: "unparsed"; raw: string }
  | { kind: "none"; raw: null };

export interface ApproachSpec {
  id: ApproachId; label: string; lanes: number; demandVph: number;
  turnRatio: Record<Movement, number>;
}
export interface PhaseSpec {
  id: string; label: string; approaches: ApproachId[];
  greenSec: number; yellowSec: number; allRedSec: number;
}
export interface SignalPlan {
  id: PlanId; label: string; phases: PhaseSpec[]; cycleSec: number;
}
export interface IntersectionSimInput {
  node: TrafficNodeSnapshot; // confidence sudah dinormalkan ke 0..1
  recommendation: ParsedRecommendation;
  geometry: {
    driveSide: "left"; laneWidthM: number; approachLengthM: number;
    approaches: ApproachSpec[];
  };
  vehicleMix: Record<VehicleType, number>;
  plans: { current: SignalPlan; ai: SignalPlan | null };
  criticalApproach: ApproachId;
  seed: number;
  meta: { source: "db+snapshot" | "snapshot"; mocked: string[]; generatedAt: string };
}
export interface SimMetrics {
  simTimeSec: number;
  queueNow: number; queueAvg: number; queueMax: number;
  delayAvgSec: number; throughputVph: number;
  spawned: number; exited: number;
  perApproach: Record<ApproachId, { queueNow: number; queueMax: number; exited: number }>;
}
```

## 8. Adapter dan route handler

`parseRecommendation(raw)`:

- `/([+\-−])\s*(\d{1,3})\s*(?:detik|dtk|s)\b/i` → `green-delta` dengan tanda.
- `/adaptif/i` → `adaptive`. `null` atau kosong → `none`. Lainnya → `unparsed`.

`buildSimInput(snapshot, { source, generatedAt })` (semua acak berasal dari `mulberry32(fnv1a(snapshot.id))`):

- Normalisasi `confidence`: `c > 1 ? c / 100 : c`.
- Mock geometri: 4 lengan; sumbu mayor (NS atau EW, dipilih seed) 3 lajur, minor 2 lajur; `laneWidthM 3.2`; `approachLengthM 120`; `driveSide "left"`.
- Mock rencana eksisting: 4 fase, satu pendekat per fase, urutan N→E→S→W; hijau mayor 35–45 dtk, minor 22–30 dtk; kuning 3; all-red 2.
- Volume dari `currentLevel`: `X = clamp(0.30 + 0.75 * level / 100, 0.30, 1.05)`; `kapasitas_i = 1800 * lanes_i * green_i / cycle`; `demandVph_i = X * kapasitas_i * w_i`, `w_i ∈ [0.85, 1.15]`.
- `criticalApproach` = pendekat dengan `demand / kapasitas` tertinggi.
- Rasio belok: kiri 0.20, lurus 0.60, kanan 0.20 (±0.05, dinormalkan). Komposisi: motor 0.60, mobil 0.32, bus 0.03, truk 0.05.
- Rencana AI: `green-delta` → hijau fase `criticalApproach` ditambah `deltaSec`, dijepit `[10, 90]`, fase lain tetap, `cycleSec` dihitung ulang. `adaptive` → siklus tetap, total hijau dibagi ulang sebanding `demandVph_i / (1800 * lanes_i)`, minimum 10 dtk. `unparsed`/`none` → `plans.ai = null`.
- `meta.mocked` memuat nama tiap bagian mock di atas.

Route `GET app/api/traffic-nodes/[id]/simulation/route.ts`:

- Ikuti pola `app/api/traffic-nodes/[id]/approve/route.ts`: `{ params }: { params: Promise<{ id: string }> }`, `await params`, `NextResponse.json`.
- Query opsional: `name, lat, lng, currentLevel, predicted30, confidence, recommendation`, divalidasi `zod` (`z.coerce.number()` untuk angka).
- `prisma.trafficNode.findUnique({ where: { id } })` hanya untuk membaca. Dilarang `update`, dilarang memanggil `maybeGenerateIncident`.
- `snapshot = { ...barisDb, ...fieldQueryYangAda }`. Tanpa baris DB dan tanpa `name` + `currentLevel` di query → `404 { error: 'Node not found' }`. Query tidak valid → `400 { error: 'Invalid data' }`.

## 9. Engine (`lib/sim/`)

- Fixed timestep `dt = 0.1 dtk`. `stepSim(state, dt)` memutasi state di tempat (tanpa alokasi per langkah di jalur panas).
- Sinyal: tiap fase berjalan hijau → kuning → all-red → fase berikutnya, berulang. Pendekat di luar fase aktif merah.
- Kedatangan: proses Poisson per pendekat (selang eksponensial, laju `demandVph / 3600`). Tiap pendekat punya aliran RNG sendiri `deriveSeed(seed, "arr-" + id)` yang juga menentukan jenis kendaraan dan gerakan. Aliran ini tidak boleh bergantung pada rencana sinyal, supaya dua varian menerima kedatangan identik. Kalau titik masuk tertutup antrean, kendaraan masuk backlog (tetap dihitung antrean dan tundaan), tidak dibuang.
- Lajur kiri. Belok kiri di lajur paling kiri, belok kanan di lajur paling kanan, lurus memilih lajur terpendek.
- Lintasan 1 dimensi per kendaraan: lajur masuk → simpang (lurus atau busur seperempat lingkaran) → lajur keluar → hilang. Posisi = jarak sepanjang lintasan.
- Car-following IDM: `a = aMax * (1 - (v/v0)^4 - (sStar/s)^2)`, `sStar = s0 + v*T + v*dv / (2*sqrt(aMax*b))`. Parameter per jenis (panjang: motor 2.0 m, mobil 4.5 m, bus 12 m, truk 9 m; `v0` sekitar 40 km/jam, truk dan bus lebih lambat). Pemimpin = kendaraan di depan pada lajur/lintasan yang sama; saat merah, atau kuning yang tidak bisa dilewati dengan perlambatan nyaman, garis henti menjadi pemimpin diam. `v >= 0`, celah tidak boleh negatif.
- Karena fase per pendekat, konflik di dalam simpang tidak dimodelkan. Catat ini dan tidak dimodelkannya motor yang menyelip sebagai keterbatasan di komentar modul.
- Metrik: antrean = kendaraan `v < 5 km/jam` di hulu garis henti + backlog (sekarang, rata-rata, maksimum); tundaan rata-rata = waktu tempuh aktual − waktu tempuh arus bebas untuk kendaraan yang keluar; throughput = kendaraan melewati garis henti per jam. Dicuplik 1 Hz.

Test wajib (`bun test lib/sim`): seed dan rencana sama → `SimMetrics` identik; `spawned` kedua rencana sama pada waktu yang sama; `spawned = aktif + exited + backlog`; tidak ada celah negatif selama 600 dtk pada `X = 1.05`; `cycleSec = Σ fase`; arus jenuh hasil simulasi untuk arus mobil saja berada di 1500–2400 kend/jam/lajur; semua string rekomendasi di bagian 3 ter-parse sesuai harapan; `green-delta` dijepit `[10, 90]`.

## 10. Hook `lib/hooks/useIntersectionSim.ts`

- Ambil input dengan `useSWR` (pola repo), key = URL bagian 8 dengan snapshot node yang dibekukan saat panel dibuka; `revalidateOnFocus`, `revalidateOnReconnect`, `revalidateIfStale` dimatikan; fetcher melempar error bila `!res.ok`.
- Engine disimpan di `useRef`: satu instance untuk tab tunggal, dua (current + ai) untuk Bandingkan, dengan seed sama.
- Satu loop `requestAnimationFrame` memakai akumulator: `acc += dtNyata * speed`, jalankan `stepSim` selama `acc >= 0.1`, maksimal 60 sub-langkah per frame. Cleanup wajib membatalkan rAF (effect berjalan dua kali di dev).
- Publikasikan `SimMetrics` dan fase aktif ke React state paling sering 4 Hz dari dalam callback rAF. Posisi kendaraan tidak pernah masuk React state.
- API: `{ status, error, retry, input, playing, speed, play, pause, reset, setSpeed, metrics, phaseState, engines }`. Kecepatan: 1×, 2×, 4×, 8×. Mulai dalam keadaan **jeda** di `t = 0`. Otomatis jeda di `t = 3600 dtk`. `reset` mengembalikan `t = 0` dengan seed yang sama.

## 11. Panel (`components/sim/`)

`IntersectionSimPanel` menerima `{ node: TrafficNodeSnapshot; onClose: () => void }` dan menutupi area peta: `absolute inset-0 z-[1000] bg-white flex flex-col`, `role="dialog"`, `aria-labelledby`, fokus dipindah ke panel saat terbuka, Esc menutup.

- Header `bg-[#111827]`: nama simpang (putih, `text-sm font-bold`), sub-label `Simulasi 3D Simpang` (`text-[10px] uppercase tracking-wider text-slate-400`), badge `DATA DEMO`, tombol tutup dengan `aria-label="Tutup simulasi"`. Gaya mengikuti header `NodeDetailPanel` di file peta.
- Tab dari `components/ui/tabs.tsx`: `Kondisi Saat Ini`, `Rekomendasi AI`, `Bandingkan`. Dua tab terakhir nonaktif bila `plans.ai === null`, dengan penjelasan: rekomendasi kosong, atau teks rekomendasi tidak memuat durasi (tampilkan teks aslinya).
- Isi: kiri = scene (`flex-1 min-h-0`); kanan = kolom `w-80` yang bisa di-scroll berisi `PhaseDiagram` dan `MetricCards`. Pakai container query Tailwind v4 supaya kolom kanan pindah ke bawah scene saat lebar panel sempit. Harus tetap terpakai pada tinggi 560 px (`/ephor/prediction`).
- `SimControls`: Putar/Jeda, Reset, pilihan kecepatan, jam simulasi `mm:ss`. Pakai `Button` dari `components/ui/button.tsx` dan ikon lucide (`Play`, `Pause`, `RotateCcw`).
- `PhaseDiagram`: satu batang horizontal per rencana, segmen proporsional detik (hijau `#16A34A`, kuning `#EAB308`, all-red `#DC2626`), label pendekat dan detik, penanda posisi waktu siklus. Di rencana AI, tandai fase yang berubah beserta selisih detiknya.
- `MetricCards`: antrean rata-rata dan maksimum (kend), tundaan rata-rata (dtk/kend), throughput (kend/jam). Di Bandingkan: nilai saat ini → AI + badge selisih; membaik `bg-green-100 text-green-700`, memburuk `bg-red-100 text-red-700`, mengikuti baris hasil `SimulationPanel` yang ada. Angka `tabular-nums`.
- Disclaimer selalu terlihat di kaki panel: `Simulasi, bukan kontrol langsung sinyal lapangan. Durasi fase eksisting, volume, geometri, dan komposisi kendaraan adalah data demo.` Tampilkan juga seed.
- State: memuat (skeleton, bukan spinner), gagal (pesan yang bisa dipahami + tombol coba lagi), tanpa WebGL (pesan + diagram fase dan metrik tetap berjalan).
- Warna dan tipografi hanya dari token/`DESIGN.md`: maroon `#8F1610`, gold `#E48E07`, netral `#111827 / #6B7280 / #e5e7eb / #f3f4f6`, radius 12 px. Light mode saja. Tanpa glassmorphism, neon, gradien besar, gaya HUD, atau emoji. Transisi 150–250 ms dan `motion-reduce:` dihormati.

## 12. Scene 3D

- `IntersectionScene` memuat `<Canvas>` dari `@react-three/fiber`: `dpr={[1, 1.5]}`, `frameloop` `"always"` saat berjalan dan `"demand"` saat jeda, kamera perspektif miring dari atas, `OrbitControls` dengan batas sudut polar dan zoom, tanpa pan.
- Tampilan terang dan fungsional: tanah `#f3f4f6`, aspal abu gelap, marka dan garis henti putih, pencahayaan ambient + satu directional. Tanpa bayangan berat dan tanpa efek post-processing.
- `VehicleInstances`: satu `InstancedMesh` per jenis kendaraan (kotak berukuran sesuai panjang jenis), kapasitas tetap. Di `useFrame`, baca state engine dari ref, `setMatrixAt`, atur `count`, `instanceMatrix.needsUpdate = true`. Pakai ulang satu `Object3D`/`Matrix4` sementara; tanpa alokasi per frame.
- `SignalHeads`: satu tiang per pendekat dengan tiga lampu; warna/emissive diubah di `useFrame` dari state sinyal engine, memakai merah/kuning/hijau token.
- Warna kendaraan dari palet `DESIGN.md`, dibedakan per jenis, dan tidak memakai merah/kuning/hijau status. Sertakan legenda kecil jenis kendaraan di UI panel (HTML, bukan di dalam canvas).
- Bandingkan: dua `<Canvas>` berdampingan dengan label `Kondisi Saat Ini` dan `Rekomendasi AI`, digerakkan jam yang sama.
- Saat panel ditutup: tidak ada rAF, listener, atau konteks WebGL yang tersisa.

## 13. Tahapan

Kerjakan berurutan. Di akhir tiap tahap jalankan verifikasinya dan laporkan hasil apa adanya sebelum lanjut.

0. **Baseline + dependency.** Simpan salinan `components/dashboard/DigitalTwinMapInner.tsx` dan keluaran `git status --short` ke direktori sementara di luar repo. Pasang dependency. Verifikasi: `bunx tsc --noEmit --incremental false` lolos; `bunx eslint app components lib` tetap 6 error / 33 warning; `bun run build` lolos.
1. **Engine headless** (`types`, `rng`, `signal`, `idm`, `engine`, `metrics` + test). Verifikasi: `bun test lib/sim`.
2. **Adapter + route.** Verifikasi: `bun test lib/sim`; dengan `bun dev`, `GET /api/traffic-nodes/x/simulation?name=Tes&currentLevel=71&recommendation=%2B15%20detik%20Durasi%20Hijau` mengembalikan `plans.current` dan `plans.ai`; id tak dikenal tanpa query → 404; data DB tidak berubah.
3. **Kerangka panel + enam sisipan.** Verifikasi di `/ephor`, `/ephor/live-map`, `/ephor/prediction`: tombol muncul di popup, panel terbuka dan tertutup (tombol dan Esc), state memuat/gagal/kosong benar. `git diff --no-index <salinan-baseline> components/dashboard/DigitalTwinMapInner.tsx` hanya berisi penambahan.
4. **Runner + UI 2D** (`useIntersectionSim`, `SimControls`, `PhaseDiagram`, `MetricCards`). Verifikasi: putar/jeda/reset/kecepatan; metrik bergerak; reset menghasilkan angka yang sama.
5. **Scene 3D.** Verifikasi: kendaraan berhenti di garis henti saat merah dan berjalan saat hijau, di lajur kiri; lampu sinkron dengan diagram fase; mulus pada 8×; tidak ada rAF tersisa setelah panel ditutup.
6. **Bandingkan.** Verifikasi: `spawned` kedua varian sama pada waktu yang sama; selisih metrik benar tanda dan warnanya.
7. **Pengerasan + regresi.** Fallback tanpa WebGL, `prefers-reduced-motion`, navigasi keyboard, tinggi 560 px. Verifikasi akhir di bagian 14.

## 14. Definisi selesai

- `bun test lib/sim`, `bunx tsc --noEmit --incremental false`, dan `bun run build` lolos.
- `bunx eslint app components lib` tidak menambah error atau warning dibanding baseline; file baru dan file peta bersih.
- Perbandingan dengan salinan baseline menunjukkan file peta hanya bertambah enam sisipan bagian 5, tanpa baris terhapus. `git status --short` tidak memuat file existing lain selain `package.json` dan lockfile.
- Dengan panel tertutup, `/ephor` (tab Live dan Prediction), `/ephor/live-map`, dan `/ephor/prediction` tampil dan berperilaku sama seperti sebelum perubahan: pin dan 8 varian ikonnya, popup, overlay CCTV/lampu/Vanguard, timeline forecast, tombol 3D/2D.
- Tab Network browser menunjukkan chunk `three` baru diunduh setelah tombol `Simulasi 3D Simpang` diklik.

Laporan akhir: ringkasan per tahap, hasil tiap perintah verifikasi (termasuk yang gagal), keluaran diff file peta, dan daftar keterbatasan model.
