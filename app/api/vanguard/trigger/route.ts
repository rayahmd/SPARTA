import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST() {
  const originLat = -7.2655 + (Math.random() * 0.02 - 0.01);
  const originLng = 112.7516 + (Math.random() * 0.02 - 0.01);
  
  // Pick a random intersection as destination
  const nodes = await prisma.trafficNode.findMany();
  if (nodes.length === 0) {
    return NextResponse.json({ error: 'No nodes found' }, { status: 400 });
  }
  
  const dest = nodes[Math.floor(Math.random() * nodes.length)];

  const vehicle = await prisma.emergencyVehicle.create({
    data: {
      label: `Ambulance ${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`,
      originLat,
      originLng,
      destLat: dest.lat,
      destLng: dest.lng,
      progress: 0,
      etaMinutes: 15,
      distanceKm: 10,
      greenWaveOn: true,
      status: 'enroute'
    }
  });

  return NextResponse.json(vehicle);
}
