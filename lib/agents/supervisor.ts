// SupervisorAgent (Ephor): menyediakan prediksi kepadatan untuk tiap simpang
// (output model prediksi yang sudah ada, kolom TrafficNode.predicted30, atau
// data skenario), menetapkan tujuan koridor, dan memantau ringkasan jaringan.
// Supervisor TIDAK menyetujui atau menolak keputusan agent mana pun.

import type { AgentSnapshot, SupervisorSummary } from "./types";

export interface CorridorGoal {
  name: string;
  nodeIds: string[];
  objective: string;
}

export class SupervisorAgent {
  private forecasts = new Map<string, number>();
  private source = "belum ada";
  corridorGoal: CorridorGoal | null = null;

  setForecasts(values: Map<string, number> | Record<string, number>, source: string): void {
    const entries = values instanceof Map ? [...values.entries()] : Object.entries(values);
    for (const [id, value] of entries) {
      if (Number.isFinite(value)) this.forecasts.set(id, Math.max(0, Math.min(100, value)));
    }
    this.source = source;
  }

  forecastFor(id: string): number {
    return this.forecasts.get(id) ?? 40;
  }

  inCorridorGoal(id: string): boolean {
    return this.corridorGoal?.nodeIds.includes(id) ?? false;
  }

  summary(agents: AgentSnapshot[]): SupervisorSummary {
    return {
      corridorGoal: this.corridorGoal,
      forecastSource: this.source,
      adjusting: agents.filter((a) => a.status === "adjusting").length,
      failsafe: agents.filter((a) => a.status === "failsafe").length,
      paused: agents.filter((a) => a.paused).length,
      totalQueue: Math.round(agents.reduce((s, a) => s + a.queueNow, 0)),
    };
  }
}
