import { NextResponse } from "next/server";
import { getAgentRuntime, tickAgentRuntime } from "@/lib/agents/server";

// Snapshot status semua agent, graf tetangga, dan event terakhir.
export async function GET() {
  const runtime = await getAgentRuntime();
  await tickAgentRuntime(runtime);
  return NextResponse.json({
    ...runtime.snapshot(),
    recentEvents: runtime.recentEvents(80),
  });
}
