// Gaussian function helper
function gaussian(x: number, mean: number, stdDev: number): number {
  return Math.exp(-Math.pow(x - mean, 2) / (2 * Math.pow(stdDev, 2)));
}

export function computeBaseLevel(hour: number): number {
  // Morning peak around 7:30, evening peak around 17:30
  const morningPeak = gaussian(hour, 7.5, 1.5) * 65;
  const eveningPeak = gaussian(hour, 17.5, 2.0) * 75;
  const baseTraffic = 15; // minimum traffic

  let level = baseTraffic + morningPeak + eveningPeak;
  
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
