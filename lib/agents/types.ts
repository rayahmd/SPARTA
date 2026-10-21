// Tipe bersama sistem multi-agent SPARTA Ephor. TypeScript murni: dipakai
// runtime server, route handler, dan UI, jadi tidak boleh mengimpor React.

export type AgentStatus = "normal" | "adjusting" | "failsafe";

export const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  normal: "Normal",
  adjusting: "Menyesuaikan",
  failsafe: "Fail-Safe",
};

/** Simpang yang dikelola satu IntersectionAgent. */
export interface IntersectionInfo {
  /** Sama dengan id TrafficNode (pin di peta). */
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Id TrafficNode lain di lokasi yang sama (baris ganda di database). */
  aliasIds?: string[];
}

export interface AgentPhase {
  id: string;
  /** Pendekat yang hijau pada fase ini. */
  approachId: string;
  label: string;
  /** Arah lengan dari pusat simpang: 0 = utara, searah jarum jam. */
  bearingDeg: number;
  greenSec: number;
  yellowSec: number;
  allRedSec: number;
}

export type PlanSource = "default" | "agent" | "neighbor" | "rollback" | "failsafe" | "override";

/** Rencana sinyal: urutan fase, durasi hijau per pendekat, dan offset koordinasi. */
export interface SignalPlan {
  phases: AgentPhase[];
  /** Pergeseran awal siklus terhadap jam bersama (dtk, 0..cycleSec). */
  offsetSec: number;
  cycleSec: number;
  source: PlanSource;
}

/** Pengamatan lokal satu detik dari sensor (digital twin). */
export interface Observation {
  queueTotal: number;
  /** Antrean per pendekat, urutan sama dengan fase. */
  queueByApproach: Record<string, number>;
}

export type ChangeKind = "apply" | "revert" | "failsafe";

export interface ChangeNotice {
  /** Id gelombang perubahan; dipertahankan saat diteruskan supaya duplikat bisa dikenali. */
  messageId: string;
  kind: ChangeKind;
  originId: string;
  originName: string;
  fromId: string;
  fromName: string;
  toId: string;
  /** 1 = tetangga langsung simpang asal. */
  hop: number;
  /** Notice kedaluwarsa setelah `sentAtSec + ttlSec`. */
  ttlSec: number;
  sentAtSec: number;
  change: {
    approachId: string;
    approachLabel: string;
    /** Perubahan hijau pendekat ini di simpang pengirim (dtk). */
    deltaGreenSec: number;
    /** Perubahan offset di simpang pengirim (dtk). */
    deltaOffsetSec: number;
    /** Arah tempuh arus yang terdampak (derajat), dari pendekat ke seberang simpang. */
    flowBearingDeg: number;
    summary: string;
  };
  platoon: {
    /** Tambahan kendaraan per siklus yang dilepas ke arah arus. */
    sizeVeh: number;
    /** Perkiraan waktu tiba rombongan di penerima (jam bersama, dtk). */
    arrivalAtSec: number;
    travelTimeSec: number;
  };
  /** Tekanan (permintaan ÷ kapasitas) pendekat pengirim yang diubah. */
  senderPressure: number;
}

export type ReplyAction = "accept" | "adjust" | "reject";

export const REPLY_LABELS: Record<ReplyAction, string> = {
  accept: "accept",
  adjust: "adjust",
  reject: "reject",
};

export interface NoticeReply {
  messageId: string;
  kind: ChangeKind;
  fromId: string;
  fromName: string;
  toId: string;
  action: ReplyAction;
  reason: string;
  /** Ringkasan perubahan yang diterapkan penerima, bila ada. */
  detail?: string;
  twin?: TwinScore;
  hop: number;
}

export interface Heartbeat {
  agentId: string;
  status: AgentStatus;
  atSec: number;
}

export interface TwinScore {
  currentScore: number;
  candidateScore: number;
  /** Positif = membaik. */
  improvementPct: number;
}

export type AgentEventType =
  | "decision_applied"
  | "decision_rejected"
  | "notice_sent"
  | "notice_ignored"
  | "reply_received"
  | "neighbor_adjusted"
  | "rollback"
  | "failsafe_enter"
  | "failsafe_exit"
  | "override"
  | "scenario";

export interface AgentEvent {
  /** Urutan global, naik terus selama proses server hidup. */
  seq: number;
  runId: string;
  type: AgentEventType;
  simTimeSec: number;
  wallTime: string;
  agentId: string;
  agentName: string;
  messageId?: string;
  targetId?: string;
  targetName?: string;
  hop?: number;
  /** Kalimat siap tampil (Bahasa Indonesia). */
  summary: string;
  reason?: string;
  twin?: TwinScore;
  reply?: ReplyAction;
}

/** Event sebelum diberi nomor urut dan waktu oleh runtime. */
export type AgentEventInput = Omit<AgentEvent, "seq" | "runId" | "simTimeSec" | "wallTime">;

export interface ReplySummary {
  agentId: string;
  agentName: string;
  action: ReplyAction;
  reason: string;
  detail?: string;
  hop: number;
}

export interface ActiveChange {
  messageId: string;
  summary: string;
  reason: string;
  appliedAtSec: number;
  twin?: TwinScore;
  /** Asal perubahan: keputusan sendiri, atau penyesuaian karena notice tetangga. */
  origin: "self" | "neighbor";
  originName: string;
  replies: ReplySummary[];
}

export interface AgentSnapshot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: AgentStatus;
  statusLabel: string;
  paused: boolean;
  plan: SignalPlan;
  defaultPlan: SignalPlan;
  forecast: number;
  queueNow: number;
  cooldownUntilSec: number;
  neighbors: string[];
  /** Id pin lain yang diwakili agent ini (baris ganda di database). */
  aliasIds: string[];
  activeChange: ActiveChange | null;
  lastDecision: { summary: string; atSec: number; applied: boolean } | null;
}

export interface GraphEdge {
  a: string;
  b: string;
  distanceM: number;
  travelTimeSec: number;
}

export type SimSpeed = 1 | 2 | 4 | 8;

export interface RuntimeSnapshot {
  runId: string;
  simTimeSec: number;
  speed: SimSpeed;
  autoMode: boolean;
  scenario: { name: string; startedAtSec: number; corridor: string[] } | null;
  persistence: "db" | "memory";
  agents: AgentSnapshot[];
  edges: GraphEdge[];
  supervisor: SupervisorSummary;
}

export interface SupervisorSummary {
  corridorGoal: { name: string; nodeIds: string[]; objective: string } | null;
  forecastSource: string;
  adjusting: number;
  failsafe: number;
  paused: number;
  totalQueue: number;
}

export type OverrideAction = "pause" | "resume" | "force_default" | "auto_mode" | "speed";
