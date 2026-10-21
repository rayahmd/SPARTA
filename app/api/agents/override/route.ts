import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgentRuntime, tickAgentRuntime } from "@/lib/agents/server";

// Override operator (human-on-the-loop): jeda/lanjutkan agent, paksa siklus
// default, mode otomatis, dan kecepatan jam. Semua dicatat sebagai event dan
// tetap lewat guardrail. Tidak ada aksi "setujui" di sini.
const bodySchema = z.object({
  action: z.enum(["pause", "resume", "force_default", "auto_mode", "speed"]),
  agentId: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  speed: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8)]).optional(),
  operator: z.string().min(1).max(60).optional(),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
  const { operator, ...cmd } = parsed.data;
  const runtime = await getAgentRuntime();
  await tickAgentRuntime(runtime);
  const result = runtime.override(cmd, operator ?? "Operator");
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
