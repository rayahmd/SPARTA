import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { getAgentRuntime } from "@/lib/agents/server";
import { agentSimInput } from "@/lib/agents/sim-view";
import { buildSimInput } from "@/lib/sim/adapter";
import type { DetectedArm, TrafficNodeSnapshot } from "@/lib/sim/types";

// Snapshot node dari client (apa yang dilihat operator saat membuka panel).
// Semua opsional: field yang tidak dikirim diambil dari database bila ada.
const querySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  currentLevel: z.coerce.number().min(0).max(100).optional(),
  predicted30: z.coerce.number().min(0).max(100).optional(),
  confidence: z.coerce.number().min(0).max(100).optional(),
  recommendation: z.string().max(300).optional(),
  // Bentuk simpang dari data jalan di peta: "arah:kelas:jumlahGaris,..."
  arms: z.string().max(200).optional(),
  // "1" = pakai model twin agent simpang ini (rencana yang diterapkan otomatis).
  agent: z.enum(["1"]).optional(),
});

const armSchema = z.object({
  bearingDeg: z.coerce.number().min(0).max(360),
  roadClass: z.string().regex(/^[a-z_]{1,20}$/),
  carriageways: z.coerce.number().int().min(1).max(8),
});

/** Mengurai parameter `arms`; hasil tidak valid diabaikan (pakai bentuk default). */
function parseArms(raw: string | undefined): DetectedArm[] | null {
  if (!raw) return null;
  const arms: DetectedArm[] = [];
  for (const part of raw.split(",")) {
    const [bearingDeg, roadClass, carriageways] = part.split(":");
    const parsed = armSchema.safeParse({ bearingDeg, roadClass, carriageways });
    if (!parsed.success) return null;
    arms.push(parsed.data);
  }
  return arms;
}

// Input simulasi untuk satu persimpangan. Hanya membaca: tidak mengubah data
// node dan tidak memicu pembuatan insiden.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
  const query = parsed.data;

  if (query.agent) {
    try {
      const agent = (await getAgentRuntime()).agentFor(id);
      if (agent) return NextResponse.json(agentSimInput(agent, new Date().toISOString()));
    } catch (error) {
      console.error("Failed to read agent model for simulation:", error);
    }
  }

  let dbNode: TrafficNodeSnapshot | null = null;
  try {
    dbNode = await prisma.trafficNode.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        lat: true,
        lng: true,
        currentLevel: true,
        predicted30: true,
        confidence: true,
        recommendation: true,
      },
    });
  } catch (error) {
    console.error("Failed to read traffic node for simulation:", error);
  }

  const name = query.name ?? dbNode?.name;
  const currentLevel = query.currentLevel ?? dbNode?.currentLevel;
  if (name === undefined || currentLevel === undefined) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  const snapshot: TrafficNodeSnapshot = {
    id,
    name,
    lat: query.lat ?? dbNode?.lat ?? 0,
    lng: query.lng ?? dbNode?.lng ?? 0,
    currentLevel,
    predicted30: query.predicted30 ?? dbNode?.predicted30 ?? currentLevel,
    confidence: query.confidence ?? dbNode?.confidence ?? 0,
    // Parameter kosong berarti "tidak ada rekomendasi" menurut snapshot client.
    recommendation:
      query.recommendation !== undefined
        ? query.recommendation.trim() || null
        : (dbNode?.recommendation ?? null),
  };

  return NextResponse.json(
    buildSimInput(snapshot, {
      source: dbNode ? "db+snapshot" : "snapshot",
      generatedAt: new Date().toISOString(),
      arms: parseArms(query.arms),
    }),
  );
}
