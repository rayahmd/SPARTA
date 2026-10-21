import { getAgentRuntime, tickAgentRuntime } from "@/lib/agents/server";
import type { AgentEvent } from "@/lib/agents/types";

const TICK_MS = 250;
const KEEPALIVE_MS = 15000;

// Stream SSE AgentEvent. Selama ada klien tersambung, stream ini juga yang
// memajukan jam simulasi. `?since=<seq>` (atau Last-Event-ID) mengirim ulang
// event yang terlewat.
export async function GET(req: Request) {
  const runtime = await getAgentRuntime();
  // EventSource menyambung ulang dengan header Last-Event-ID.
  const since = Number(req.headers.get("last-event-id") ?? new URL(req.url).searchParams.get("since") ?? "0");
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const sendEvent = (event: AgentEvent) => send(`id: ${event.seq}\nevent: agent\ndata: ${JSON.stringify(event)}\n\n`);

      send(`retry: 3000\n\n`);
      for (const event of runtime.eventsSince(Number.isFinite(since) ? since : 0)) sendEvent(event);
      const unsubscribe = runtime.subscribe(sendEvent);
      const tick = setInterval(() => void tickAgentRuntime(runtime), TICK_MS);
      const keepalive = setInterval(() => send(`: keepalive\n\n`), KEEPALIVE_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(tick);
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          // sudah tertutup
        }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
