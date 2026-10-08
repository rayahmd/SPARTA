import { Box, Brain, Check, Clock, X } from "lucide-react";
import { buildAiReasoning } from "./AiRecommendationPanel";

// Isi popup pin persimpangan. Dirender jadi HTML statis (renderToString) di
// DigitalTwinMapInner, jadi tidak boleh memakai hook atau event handler React:
// tiap aksi diberi atribut `data-action` dan listener-nya dipasang di
// `openNodePopup`.

export interface NodePopupNode {
  id: string;
  name: string;
  currentLevel: number;
  predicted30: number;
  confidence: number;
  recommendation: string | null;
  updatedAt?: string;
}

export interface NodePopupCardProps {
  node: NodePopupNode;
  /** Label mode peta, mis. "Status Live". */
  modeLabel: string;
  /** Badge status: Lancar / Sedang / Padat / Macet / Kritis. */
  statusLabel: string;
  statusColor: string;
  /** Warna angka dan progress bar untuk satu tingkat kemacetan (0..100). */
  colorForLevel: (level: number) => string;
  /**
   * Tile tengah. Kosong di mode Live: memakai prediksi AI yang sama dengan
   * kartu AI Recommendation. Di mode lain diisi level yang sedang ditampilkan peta.
   */
  forecast?: { label: string; value: number };
  /** Aksi sekunder yang sudah ada sebelumnya (approve / detail / sim). */
  secondaryAction: "approve" | "detail" | "sim";
  secondaryLabel: string;
}

function formatTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function StatTile({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-1.5 py-1.5 text-center">
      <p className="truncate text-[9px] font-bold uppercase leading-3 tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className="mt-0.5 text-base font-bold leading-5 tabular-nums text-[#111827]"
        style={color ? { color } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

export function NodePopupCard({
  node,
  modeLabel,
  statusLabel,
  statusColor,
  colorForLevel,
  forecast,
  secondaryAction,
  secondaryLabel,
}: NodePopupCardProps) {
  const ai = buildAiReasoning(node);
  const confidencePct = Math.round(
    node.confidence > 1 ? node.confidence : node.confidence * 100,
  );
  const updatedAt = formatTime(node.updatedAt);
  const level = Math.max(0, Math.min(100, Math.round(node.currentLevel)));
  const levelColor = colorForLevel(level);
  const forecastLabel = forecast?.label ?? `+${ai.forecastTime}`;
  const forecastValue = Math.round(forecast?.value ?? node.predicted30);

  return (
    <div className="w-[320px] max-w-[calc(100vw-1.5rem)] max-h-[min(340px,calc(100vh-9rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white font-sans text-[#111827] shadow-xl animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none">
      <div className="space-y-2 p-3">
        {/* Header */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-bold leading-5">
                {node.name}
              </h3>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase leading-4 tracking-wide text-white"
                style={{ background: statusColor }}
              >
                {statusLabel}
              </span>
            </div>
            <p className="flex items-center gap-1.5 text-[11px] leading-4 text-slate-500">
              <span>{modeLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                ID {node.id.slice(-6).toUpperCase()}
              </span>
              {updatedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <Clock size={11} aria-hidden="true" />
                  <span className="tabular-nums">{updatedAt}</span>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            data-action="close"
            aria-label="Tutup"
            className="-mr-1 -mt-0.5 shrink-0 cursor-pointer rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>

        {/* Stat */}
        <div className="grid grid-cols-3 gap-1.5">
          <StatTile
            label="Saat ini"
            value={`${Math.round(node.currentLevel)}%`}
            color={levelColor}
          />
          <StatTile
            label={forecastLabel}
            value={`${forecastValue}%`}
            color={colorForLevel(forecastValue)}
          />
          <StatTile
            label="Stlh intervensi"
            value={node.recommendation ? `${ai.simResult}%` : "—"}
            color={node.recommendation ? "#15803d" : undefined}
          />
        </div>

        {/* Progress kemacetan */}
        <div
          className="h-1.5 overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={`Kemacetan saat ini ${level}%`}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${level}%`, background: levelColor }}
          />
        </div>

        {/* Rekomendasi AI */}
        <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-2.5 py-2">
          <Brain
            size={15}
            className="mt-0.5 shrink-0 text-yellow-700"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold leading-4 text-yellow-900">
              {node.recommendation ?? "Tidak ada rekomendasi AI"}
            </p>
            <p className="mt-1 flex flex-wrap gap-1">
              <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold leading-3 text-slate-700 ring-1 ring-yellow-200">
                Confidence {confidencePct}%
              </span>
              {node.recommendation && (
                <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold leading-3 text-slate-700 ring-1 ring-yellow-200">
                  Reduksi {ai.simReduction}%
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Aksi */}
        <div className="flex gap-2">
          <button
            type="button"
            data-action="sim3d"
            className="flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#8F1610] px-3 text-xs font-bold text-white transition-colors hover:bg-[#8F1610]/90"
          >
            <Box size={14} className="text-amber-300" aria-hidden="true" />
            Simulasi 3D Simpang
          </button>
          <button
            type="button"
            data-action={secondaryAction}
            className="flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-[#111827] transition-colors hover:bg-slate-50"
          >
            {secondaryAction === "approve" && (
              <Check size={14} className="text-[#16A34A]" aria-hidden="true" />
            )}
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
