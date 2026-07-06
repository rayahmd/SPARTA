import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { advanceVehicle } from '@/lib/simulation/vanguardSimulator';

export async function GET() {
  const activeVehicles = await prisma.emergencyVehicle.findMany({
    where: { status: 'enroute' }
  });

  const updatedVehicles = await Promise.all(activeVehicles.map(async (v) => {
    const updated = advanceVehicle(v);
    
    return prisma.emergencyVehicle.update({
      where: { id: v.id },
      data: {
        progress: updated.progress,
        etaMinutes: updated.etaMinutes,
        distanceKm: updated.distanceKm,
        status: updated.status,
        greenWaveOn: updated.progress < 1
      }
    });
  }));

  return NextResponse.json(updatedVehicles);
}
