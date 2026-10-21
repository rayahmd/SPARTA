// Penyimpanan log keputusan agent ke tabel agent_events lewat Prisma.
// Ditulis per batch di latar belakang. Bila database tidak tersedia (atau
// migrasi belum dijalankan), log tetap ada di memori runtime dan penulisan
// dicoba lagi berkala, tanpa menghentikan agent.

import prisma from "@/lib/db";
import type { AgentEvent } from "./types";

const FLUSH_MS = 2000;
const RETRY_MS = 60000;
const MAX_PENDING = 1000;

export class AgentEventStore {
  private pending: AgentEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryAt = 0;
  available = true;

  constructor(private readonly onAvailability?: (available: boolean) => void) {}

  add(event: AgentEvent): void {
    this.pending.push(event);
    if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING);
    if (!this.timer) this.timer = setTimeout(() => void this.flush(), FLUSH_MS);
  }

  private setAvailable(value: boolean): void {
    if (this.available === value) return;
    this.available = value;
    this.onAvailability?.(value);
  }

  async flush(): Promise<void> {
    this.timer = null;
    if (this.pending.length === 0) return;
    if (!this.available && Date.now() < this.retryAt) {
      // Database belum bisa dipakai: buang yang lama, simpan di memori saja.
      this.pending = this.pending.slice(-200);
      this.timer = setTimeout(() => void this.flush(), FLUSH_MS);
      return;
    }
    const batch = this.pending.splice(0, this.pending.length);
    try {
      await prisma.agentEvent.createMany({
        data: batch.map((e) => ({
          seq: e.seq,
          runId: e.runId,
          type: e.type,
          agentId: e.agentId,
          agentName: e.agentName,
          messageId: e.messageId ?? null,
          simTimeSec: e.simTimeSec,
          summary: e.summary,
          payload: JSON.stringify(e),
          createdAt: new Date(e.wallTime),
        })),
      });
      this.setAvailable(true);
    } catch (error) {
      if (this.available) console.error("[agents] agent_events tidak dapat ditulis, log hanya di memori:", error);
      this.setAvailable(false);
      this.retryAt = Date.now() + RETRY_MS;
    }
  }
}
