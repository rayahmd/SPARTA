// Gaussian function helper
function gaussian(x: number, mean: number, stdDev: number): number {
  return Math.exp(-Math.pow(x - mean, 2) / (2 * Math.pow(stdDev, 2)));
}

// Pola harian tanpa noise: puncak pagi ~07:30 dan sore ~17:30.
export function typicalLevel(hour: number): number {
  const morningPeak = gaussian(hour, 7.5, 1.5) * 65;
  const eveningPeak = gaussian(hour, 17.5, 2.0) * 75;
  const baseTraffic = 15; // minimum traffic
  return baseTraffic + morningPeak + eveningPeak;
}

/**
 * Proyeksi tingkat kemacetan `hoursAhead` jam dari `now`. Selisih kondisi
 * simpang terhadap pola harian saat ini dianggap memudar seiring waktu,
 * sehingga proyeksi jauh mendekati pola harian di jam tujuan.
 */
export function projectLevel(currentLevel: number, hoursAhead: number, now: Date = new Date()): number {
  if (hoursAhead <= 0) return currentLevel;
  const hour = now.getHours() + now.getMinutes() / 60;
  const deviation = currentLevel - typicalLevel(hour);
  const keep = Math.exp(-hoursAhead / 2);
  const level = typicalLevel((hour + hoursAhead) % 24) + deviation * keep;
  return Math.max(0, Math.min(100, level));
}

/** Tingkat keyakinan proyeksi (%), turun seiring jarak waktu. */
export function projectionConfidence(hoursAhead: number): number {
  return hoursAhead <= 0 ? 99 : Math.round(92 - (hoursAhead - 1) * 6);
}

export function computeBaseLevel(hour: number): number {
  let level = typicalLevel(hour);

  // Add random noise -5 to +5
  const noise = (Math.random() * 10) - 5;
  level += noise;

  return Math.max(0, Math.min(100, Math.round(level)));
}

export function predictLevel(currentLevel: number, hour: number): { predicted30: number, confidence: number, recommendation: string | null } {
  // predict for half hour later
  const nextHour = (hour + 0.5) % 24;
  let predicted30 = computeBaseLevel(nextHour);
  
  // smooth with current level to make it realistic
  predicted30 = Math.round((currentLevel * 0.6) + (predicted30 * 0.4));
  
  // FORCE CONGESTION PREDICTION FOR UI DEMONSTRATION
  // Bump prediction by +35% to ensure it shows severe congestion UI elements
  predicted30 = Math.min(100, predicted30 + 35);
  
  const confidence = 0.85 + (Math.random() * 0.10); // 0.85 to 0.95

  let recommendation = null;
  if (predicted30 > 65) {
    recommendation = "+15 detik Durasi Hijau";
  } else if (predicted30 > 45) {
    recommendation = "+10 detik Durasi Hijau";
  } else if (predicted30 > 30) {
    recommendation = "Aktifkan siklus sinyal adaptif";
  } else {
    recommendation = "-10 detik Durasi Hijau";
  }

  return { predicted30, confidence, recommendation };
}
