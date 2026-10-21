import { EmergencyVehicle } from '@prisma/client';

export function advanceVehicle(vehicle: EmergencyVehicle): EmergencyVehicle {
  if (vehicle.status === 'arrived') return vehicle;

  // Assuming a vehicle takes 15 minutes to complete a 10km journey.
  // Calculate progress dynamically based on time elapsed since createdAt
  const now = new Date();
  const elapsedMs = now.getTime() - vehicle.createdAt.getTime();
  const estimatedTotalTimeMs = 15 * 60 * 1000; // 15 mins
  
  const newProgress = elapsedMs / estimatedTotalTimeMs;
  
  if (newProgress >= 1) {
    return {
      ...vehicle,
      progress: 1,
      etaMinutes: 0,
      distanceKm: 0,
      status: 'arrived',
      greenWaveOn: false
    };
  }

  const remainingRatio = 1 - newProgress;
  const newEta = Math.max(1, Math.round(15 * remainingRatio));
  const newDistance = Number((10 * remainingRatio).toFixed(1));

  return {
    ...vehicle,
    progress: newProgress,
    etaMinutes: newEta,
    distanceKm: newDistance
  };
}
