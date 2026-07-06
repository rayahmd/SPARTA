import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { computeBaseLevel, predictLevel } from '@/lib/simulation/trafficModel';
import { maybeGenerateIncident } from '@/lib/simulation/incidentGenerator';

export async function GET() {
  // trigger incident generation occasionally when this is polled
  await maybeGenerateIncident();

  const nodes = await prisma.trafficNode.findMany();
  const currentHour = new Date().getHours() + (new Date().getMinutes() / 60);

  // Recompute and update
  const updatedNodes = await Promise.all(nodes.map(async (node) => {
    const base = computeBaseLevel(currentHour);
    const newCurrent = Math.max(0, Math.min(100, Math.round(base + (Math.random() * 10 - 5))));
    
    const { predicted30, confidence, recommendation } = predictLevel(newCurrent, currentHour);

    return prisma.trafficNode.update({
      where: { id: node.id },
      data: {
        currentLevel: newCurrent,
        predicted30,
        confidence,
        recommendation
      }
    });
  }));

  return NextResponse.json(updatedNodes);
}
