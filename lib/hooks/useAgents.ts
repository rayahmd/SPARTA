import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import type { OverrideCommand } from "@/lib/agents/runtime";
import type { AgentEvent, RuntimeSnapshot } from "@/lib/agents/types";

export interface AgentsResponse extends RuntimeSnapshot {
  recentEvents: AgentEvent[];
}

const MAX_EVENTS = 200;

const fetcher = async (url: string): Promise<AgentsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Server menjawab HTTP ${res.status}`);
  return res.json();
};

/**
 * Status agent (polling /api/agents) + feed event real-time (SSE
 * /api/agents/events). Feed hanya berisi event dari run terbaru: skenario demo
 * memulai run baru, jadi feed ikut bersih.
 */
export function useAgents() {
  const { data, error, mutate } = useSWR<AgentsResponse, Error>("/api/agents", fetcher, {
    refreshInterval: 2000,
  });
  const [streamed, setStreamed] = useState<AgentEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource("/api/agents/events");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener("agent", (msg) => {
      const event = JSON.parse((msg as MessageEvent<string>).data) as AgentEvent;
      setStreamed((prev) => {
        if (prev.some((e) => e.seq === event.seq)) return prev;
        const next = prev.concat(event);
        return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
      });
      if (event.type === "scenario" || event.type === "override" || event.type.startsWith("failsafe")) {
        void mutate();
      }
    });
    return () => source.close();
  }, [mutate]);

  const events = useMemo(() => {
    const bySeq = new Map<number, AgentEvent>();
    for (const e of data?.recentEvents ?? []) bySeq.set(e.seq, e);
    for (const e of streamed) bySeq.set(e.seq, e);
    const all = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
    const runId = all.at(-1)?.runId ?? data?.runId;
    return all.filter((e) => e.runId === runId).slice(-MAX_EVENTS);
  }, [data?.recentEvents, data?.runId, streamed]);

  const post = useCallback(
    async (url: string, body: unknown): Promise<{ ok: boolean; message: string }> => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
        return { ok: res.ok && json.ok !== false, message: json.message ?? `HTTP ${res.status}` };
      } catch {
        return { ok: false, message: "Server tidak dapat dihubungi" };
      } finally {
        void mutate();
      }
    },
    [mutate],
  );

  return {
    snapshot: data ?? null,
    error: error ?? null,
    connected,
    events,
    override: useCallback((cmd: OverrideCommand) => post("/api/agents/override", cmd), [post]),
    startScenario: useCallback(() => post("/api/agents/scenario", { scenario: "koridor" }), [post]),
    stopScenario: useCallback(() => post("/api/agents/scenario", { scenario: "live" }), [post]),
  };
}

export type AgentsState = ReturnType<typeof useAgents>;
