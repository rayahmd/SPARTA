import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const { id } = resolvedParams;
  const body = await req.json();
  const { action } = body; // approve, adjust, reject

  // Clear recommendation after action
  const node = await prisma.trafficNode.update({
    where: { id },
    data: {
      recommendation: null
    }
  });

  return NextResponse.json({ success: true, node, action });
}
