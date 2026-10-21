// Semua ambang sistem multi-agent di satu tempat. Agent, guardrail, twin gate,
// dan runtime membaca nilai dari sini; test boleh menimpa sebagian lewat
// `withConfig`.
//
// PERINGATAN: setiap angka di bawah adalah placeholder dan harus dikalibrasi
// dengan data lapangan (survei volume, waktu tempuh, lebar penyeberangan)
// sebelum dipakai di luar demo.

export interface AgentConfig {
  /** Perubahan maksimum hijau (dan offset) per fase dalam satu siklus (dtk). Placeholder, harus dikalibrasi. */
  maxDeltaPerCycleSec: number;
  /** Hijau minimum per fase (dtk). Placeholder, harus dikalibrasi. */
  minGreenSec: number;
  /** Hijau maksimum per fase (dtk). Placeholder, harus dikalibrasi. */
  maxGreenSec: number;
  /** Waktu aman pejalan kaki menyeberang; hijau fase tidak boleh lebih pendek (dtk). Placeholder, harus dikalibrasi. */
  pedestrianClearanceSec: number;
  /** Kuning tetap, tidak boleh diubah agent (dtk). Placeholder, harus dikalibrasi. */
  yellowSec: number;
  /** All-red tetap, tidak boleh diubah agent (dtk). Placeholder, harus dikalibrasi. */
  allRedSec: number;
  /** Panjang siklus minimum (dtk). Placeholder, harus dikalibrasi. */
  cycleMinSec: number;
  /** Panjang siklus maksimum (dtk). Placeholder, harus dikalibrasi. */
  cycleMaxSec: number;
  /** Batas rambat notice dari simpang asal. Placeholder, harus dikalibrasi. */
  maxHops: number;
  /** Jumlah siklus jeda sebelum simpang yang sama boleh berubah lagi. Placeholder, harus dikalibrasi. */
  cooldownCycles: number;
  /** Perbaikan skor twin minimum agar rencana diterapkan (%). Placeholder, harus dikalibrasi. */
  twinMinImprovementPct: number;
  /** Lama pemantauan setelah rencana diterapkan (dtk). Placeholder, harus dikalibrasi. */
  rollbackWindowSec: number;
  /** Rollback bila metrik memburuk lebih dari persen ini dibanding baseline. Placeholder, harus dikalibrasi. */
  rollbackWorsePct: number;
  /** Heartbeat tetangga atau sensor dianggap hilang setelah selang ini (dtk). Placeholder, harus dikalibrasi. */
  heartbeatTimeoutSec: number;
  /** Selang kirim heartbeat (dtk). Placeholder, harus dikalibrasi. */
  heartbeatIntervalSec: number;
  /** Radius pencarian tetangga (m). Placeholder, harus dikalibrasi. */
  neighborRadiusM: number;
  /** Jumlah tetangga terdekat maksimum per simpang. Placeholder, harus dikalibrasi. */
  kNearest: number;
  /** Kecepatan rombongan untuk waktu tempuh antar simpang (m/dtk, 30 km/jam). Placeholder, harus dikalibrasi. */
  platoonSpeedMps: number;
  /** Umur notice maksimum sebelum diabaikan (dtk). Placeholder, harus dikalibrasi. */
  noticeTtlSec: number;
  /** Latensi bus pesan antar agent (dtk simulasi). Placeholder, harus dikalibrasi. */
  busLatencySec: number;
  /** Prediksi kepadatan (0..100) minimum sebelum agent mencari rencana baru. Placeholder, harus dikalibrasi. */
  forecastTriggerLevel: number;
  /** Rasio tekanan pendekat (permintaan ÷ kapasitas) yang memicu perubahan. Placeholder, harus dikalibrasi. */
  pressureTrigger: number;
  /** Tekanan simpang hilir di atas nilai ini dianggap berisiko antrean balik (spillback). Placeholder, harus dikalibrasi. */
  spillbackPressure: number;
  /** Bobot biaya antrean balik pada skor twin simpang hulu. Placeholder, harus dikalibrasi. */
  spillbackWeight: number;
  /** Porsi rombongan yang tersisa per hop karena dispersi. Placeholder, harus dikalibrasi. */
  platoonDispersion: number;
  /** Lama simulasi twin per evaluasi (dtk simulasi). Placeholder, harus dikalibrasi. */
  twinHorizonSec: number;
  /** Lonjakan antrean per detik yang dianggap anomali sensor (kendaraan). Placeholder, harus dikalibrasi. */
  anomalyJumpVeh: number;
}

export const AGENT_CONFIG: AgentConfig = {
  maxDeltaPerCycleSec: 15,
  minGreenSec: 10,
  maxGreenSec: 60,
  pedestrianClearanceSec: 12,
  yellowSec: 3,
  allRedSec: 2,
  cycleMinSec: 60,
  cycleMaxSec: 140,
  maxHops: 2,
  cooldownCycles: 1,
  twinMinImprovementPct: 3,
  rollbackWindowSec: 60,
  rollbackWorsePct: 5,
  heartbeatTimeoutSec: 10,
  heartbeatIntervalSec: 2,
  neighborRadiusM: 1200,
  kNearest: 3,
  platoonSpeedMps: 30 / 3.6,
  noticeTtlSec: 120,
  busLatencySec: 1,
  forecastTriggerLevel: 60,
  pressureTrigger: 1,
  spillbackPressure: 0.85,
  spillbackWeight: 2,
  platoonDispersion: 0.6,
  twinHorizonSec: 600,
  anomalyJumpVeh: 60,
};

export function withConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return { ...AGENT_CONFIG, ...overrides };
}
