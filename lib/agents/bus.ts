// Bus pesan antar agent. Topik meniru MQTT supaya implementasi in-memory ini
// bisa diganti broker MQTT asli tanpa mengubah agent:
//   sparta/agents/{id}/notice     ChangeNotice untuk agent {id}
//   sparta/agents/{id}/reply      NoticeReply untuk agent {id}
//   sparta/agents/{id}/heartbeat  Heartbeat dari agent {id}
// Pola langganan mendukung wildcard satu level `+` seperti MQTT.
//
// Pesan dikirim dengan latensi (detik simulasi) dan diantar berurutan menurut
// (waktu tiba, nomor kirim), jadi urutan antar pesan selalu deterministik.

export const topics = {
  notice: (id: string) => `sparta/agents/${id}/notice`,
  reply: (id: string) => `sparta/agents/${id}/reply`,
  heartbeat: (id: string) => `sparta/agents/${id}/heartbeat`,
} as const;

export type BusHandler = (payload: unknown, topic: string) => void;

export interface MessageBus {
  publish(topic: string, payload: unknown, opts?: { delaySec?: number }): void;
  subscribe(pattern: string, handler: BusHandler): () => void;
  /** Mengantar semua pesan yang jatuh tempo pada `nowSec`; mengembalikan jumlahnya. */
  deliverDue(nowSec: number): number;
}

interface Pending {
  deliverAt: number;
  seq: number;
  topic: string;
  payload: unknown;
}

export function topicMatches(pattern: string, topic: string): boolean {
  const p = pattern.split("/");
  const t = topic.split("/");
  for (let i = 0; i < p.length; i++) {
    if (p[i] === "#") return true;
    if (i >= t.length) return false;
    if (p[i] !== "+" && p[i] !== t[i]) return false;
  }
  return p.length === t.length;
}

export class InMemoryBus implements MessageBus {
  private queue: Pending[] = [];
  private subs: { pattern: string; handler: BusHandler }[] = [];
  private seq = 0;
  private now = 0;

  constructor(private readonly latencySec: number) {}

  publish(topic: string, payload: unknown, opts: { delaySec?: number } = {}): void {
    this.queue.push({
      deliverAt: this.now + (opts.delaySec ?? this.latencySec),
      seq: this.seq++,
      topic,
      payload,
    });
  }

  subscribe(pattern: string, handler: BusHandler): () => void {
    const sub = { pattern, handler };
    this.subs.push(sub);
    return () => {
      this.subs = this.subs.filter((s) => s !== sub);
    };
  }

  deliverDue(nowSec: number): number {
    this.now = nowSec;
    // Satu putaran saja: pesan yang dikirim selama pengantaran ini menunggu
    // panggilan berikutnya, jadi balasan berantai tidak bisa berputar tanpa henti.
    const due = this.queue
      .filter((m) => m.deliverAt <= nowSec)
      .sort((a, b) => a.deliverAt - b.deliverAt || a.seq - b.seq);
    if (due.length === 0) return 0;
    const dueSet = new Set(due);
    this.queue = this.queue.filter((m) => !dueSet.has(m));
    for (const msg of due) {
      for (const sub of this.subs.slice()) {
        if (topicMatches(sub.pattern, msg.topic)) sub.handler(msg.payload, msg.topic);
      }
    }
    return due.length;
  }

  /** Jumlah pesan yang belum diantar (untuk test). */
  get pending(): number {
    return this.queue.length;
  }
}
