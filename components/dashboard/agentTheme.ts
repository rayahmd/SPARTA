// Warna dan label status agent, dipakai peta, popup, dan panel Aktivitas Agent.

import type { AgentSnapshot, AgentStatus } from "@/lib/agents/types";

export type AgentStatusKey = AgentStatus | "paused";

export const AGENT_STATUS_COLORS: Record<AgentStatusKey, string> = {
  normal: "#16A34A",
  adjusting: "#E48E07",
  failsafe: "#DC2626",
  paused: "#64748B",
};

export const AGENT_STATUS_TEXT: Record<AgentStatusKey, string> = {
  normal: "Normal",
  adjusting: "Menyesuaikan",
  failsafe: "Fail-Safe",
  paused: "Dijeda",
};

export function agentStatusKey(agent: Pick<AgentSnapshot, "status" | "paused">): AgentStatusKey {
  // Fail-safe lebih penting ditampilkan daripada jeda.
  if (agent.status === "failsafe") return "failsafe";
  return agent.paused ? "paused" : agent.status;
}

/** Emas SPARTA untuk denyut propagasi dan aksen keputusan otomatis. */
export const AGENT_GOLD = "#E48E07";
export const AGENT_MAROON = "#8F1610";
