# 🚦 SPARTA Ephor Dashboard

SPARTA Ephor Dashboard adalah platform **Digital Twin** antarmuka pusat kendali lalu lintas *(Traffic Command Center)* untuk memantau kemacetan lalu lintas kota secara real-time, mensimulasikan skenario intervensi lampu lalu lintas, dan menguji prediksi kemacetan berbasis AI (SPARTA-Athena Engine).

## 🚀 Fitur Utama

- **Digital Twin Map (Command Center View):** Menggunakan basis peta CartoDB Dark Matter dengan visualisasi bersinar *(glowing)* berlatar belakang gelap, lengkap dengan garis rute aktif.
- **Interactive Map Overlays:** Tombol kontrol cepat untuk menyalakan/mematikan visualisasi:
  - 📷 **CCTV** (Status kamera online)
  - 🚦 **Lampu Lalu Lintas** (Fase aktif hijau/kuning/merah)
  - 🚑 **Vanguard Unit** (Ambulans dan jalur prioritas darurat)
  - ⚠️ **Laporan Masyarakat** (Titik kemacetan dari warga)
  - 📅 **Event Aktif** (Potensi kepadatan di sekitar area acara)
- **AI Prediction Timeline:** Memprediksi kemacetan di masa mendatang (Kondisi saat ini vs +30 Menit vs +60 Menit) secara bertahap dan halus.
- **Simulation Intervention Panel:** Menjalankan skenario intervensi SITS (seperti penambahan durasi lampu hijau +5s/+10s/+15s atau alih arus jalan) untuk melihat estimasi persentase perbaikan kemacetan, antrean jalan, dan waktu tempuh.
- **AI Recommendation Panel:** Panel rekomendasi alur logis (Prediksi ➜ Simulasi ➜ Rekomendasi Aksi) dilengkapi dengan *Reasoning Trace* yang transparan mengenai performa model AI.
- **Resizable Layout:** Panel AI dan panel SPARTA-Vanguard di sisi kanan dapat diatur tinggi ukurannya secara dinamis.

---

## 🛠️ Panduan Instalasi & Menjalankan Project

Proyek ini dibangun menggunakan **Next.js 16 (App Router)**, **React 19**, **Tailwind CSS v4**, **Prisma (SQLite)**, dan direkomendasikan dijalankan menggunakan **Bun**.

### 1. Prasyarat
Pastikan Anda sudah menginstal **Bun** di komputer Anda. Jika belum, Anda bisa menginstalnya via terminal:
```bash
# macOS & Linux
curl -fsSL https://bun.sh/install | bash

# Windows (via PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
```

### 2. Install Dependensi
Klon repositori ini, masuk ke direktori proyek, dan jalankan perintah install:
```bash
bun install
```

### 3. Setup Database (Prisma SQLite)
Aplikasi ini menyimpan data simpang lalu lintas di database SQLite lokal (`dev.db`). Lakukan inisialisasi tabel database dan buat data awal *(seeding)* dengan langkah berikut:
```bash
# Membuat file database sqlite dan struktur tabelnya
bunx prisma db push

# Mengisi database dengan data simpang lalu lintas bawaan (seed)
bunx prisma db seed
```

### 4. Jalankan Server Development
Setelah database siap, nyalakan server lokal:
```bash
bun dev
```

Buka browser Anda di alamat [http://localhost:3000](http://localhost:3000) untuk mengakses dasbor.

---

## 📂 Struktur Folder Utama

- `/app` — Routing halaman (Next.js App Router). Halaman dashboard utama ada di `/app/(dashboard)/ephor/page.tsx`.
- `/components` — Komponen UI reusable. Peta Digital Twin berada di `/components/dashboard/DigitalTwinMapInner.tsx`.
- `/lib` — Logika model lalu lintas, simulasi skenario, dan integrasi database Prisma.
- `/prisma` — Skema database dan skrip *seeder* (`seed.ts`).
