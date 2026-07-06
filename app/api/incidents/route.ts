import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { z } from 'zod';

const incidentSchema = z.object({
  type: z.string(),
  lat: z.number(),
  lng: z.number(),
  description: z.string(),
});

export async function GET() {
  const incidents = await prisma.incident.findMany({
    where: { status: 'active' },
    orderBy: { createdAt: 'desc' }
  });
  return NextResponse.json(incidents);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = incidentSchema.parse(body);

    const incident = await prisma.incident.create({
      data: {
        ...data,
        source: 'crowdsource',
        status: 'active',
        // expires in 2 hours
        expiresAt: new Date(Date.now() + 2 * 3600000)
      }
    });

    return NextResponse.json(incident, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }
}
