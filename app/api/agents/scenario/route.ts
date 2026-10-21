import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgentRuntime, liveForecasts } from "@/lib/agents/server";

// Skenario demo deterministik. "koridor" memulai ulang semua agent dengan
// seed tetap; "live" kembali memakai prediksi dari database.
const bodySchema = z.object({
  scenario: z.enum(["koridor", "live"]).default("koridor"),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }
  const runtime = await getAgentRuntime();
  if (parsed.data.scenario === "live") {
    const { forecasts, source } = await liveForecasts();
    runtime.stopScenario(forecasts, source);
    return NextResponse.json({ ok: true, message: "Kembali ke mode live", runId: runtime.runId });
  }
  const result = runtime.runScenario();
  return NextResponse.json(
    {
      ok: result.ok,
      message: result.message,
      runId: runtime.runId,
      corridor: result.corridor
        ? [result.corridor.upstream.name, result.corridor.center.name, result.corridor.downstream.name]
        : null,
    },
    { status: result.ok ? 200 : 409 },
  );
}
