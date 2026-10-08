"use client";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIntersectionSim } from "@/lib/hooks/useIntersectionSim";
import { VEHICLE_TYPES } from "@/lib/sim/idm";
import type {
  DetectedArm,
  IntersectionSimInput,
  PlanId,
  TrafficNodeSnapshot,
  VehicleType,
} from "@/lib/sim/types";
import { cn } from "@/lib/utils";
import { IntersectionScene } from "./IntersectionScene";
import { MetricCards } from "./MetricCards";
import { PhaseDiagram } from "./PhaseDiagram";
import { SimControls } from "./SimControls";
import { VEHICLE_LABELS } from "./simTheme";

export type SimTab = "current" | "ai" | "compare";

interface IntersectionSimPanelProps {
  node: TrafficNodeSnapshot;
  /** Lengan simpang dari data jalan di peta; null → bentuk default (perempatan). */
  arms?: DetectedArm[] | null;
  onClose: () => void;
}

const TAB_LABELS: Record<SimTab, string> = {
  current: "Kondisi Saat Ini",
  ai: "Rekomendasi AI",
  compare: "Bandingkan",
};

/** Alasan rencana AI tidak tersedia, atau null bila tersedia. */
function aiUnavailableReason(input: IntersectionSimInput): string | null {
  if (input.plans.ai) return null;
  if (input.recommendation.kind === "unparsed") {
    return `Teks rekomendasi tidak memuat durasi lampu, jadi tidak bisa disimulasikan: “${input.recommendation.raw}”.`;
  }
  return "Simpang ini tidak punya rekomendasi AI saat panel dibuka. Hanya kondisi saat ini yang bisa disimulasikan.";
}

/** Cara teks rekomendasi diterjemahkan menjadi rencana sinyal. */
function recommendationNote(input: IntersectionSimInput): string | null {
  const { recommendation, plans, criticalApproach } = input;
  if (!plans.ai) return null;
  const approach =
    input.geometry.approaches.find((a) => a.id === criticalApproach)?.label ??
    criticalApproach;
  if (recommendation.kind === "green-delta") {
    const index = plans.current.phases.findIndex((p) =>
      p.approaches.includes(criticalApproach),
    );
    const applied =
      index >= 0
        ? plans.ai.phases[index].greenSec - plans.current.phases[index].greenSec
        : recommendation.deltaSec;
    const sign = applied > 0 ? "+" : "−";
    const clamped =
      applied !== recommendation.deltaSec ? " (dibatasi 10–90 dtk)" : "";
    return `Diterapkan sebagai ${sign}${Math.abs(applied)} dtk hijau${clamped} pada pendekat ${approach}, pendekat terpadat. Teks rekomendasi tidak menyebut pendekat, jadi pilihan ini asumsi demo.`;
  }
  if (recommendation.kind === "adaptive") {
    return "Diterapkan sebagai pembagian ulang waktu hijau sebanding volume tiap pendekat, panjang siklus tetap. Ini asumsi demo.";
  }
  return null;
}

const JUNCTION_NAMES: Record<number, string> = {
  2: "ruas jalan (2 lengan)",
  3: "pertigaan (3 lengan)",
  4: "perempatan (4 lengan)",
  5: "simpang lima (5 lengan)",
};

/** Dari mana bentuk simpang di scene berasal. */
function junctionNote(input: IntersectionSimInput): string {
  const { source, armCount } = input.meta.junction;
  const shape = JUNCTION_NAMES[armCount] ?? `${armCount} lengan`;
  return source === "osm"
    ? `Bentuk simpang: ${shape}, dibaca dari data jalan OpenStreetMap di sekitar pin. Jumlah lajur diperkirakan dari kelas jalan.`
    : `Bentuk simpang: ${shape} default. Data jalan di sekitar pin tidak membentuk simpang yang terbaca, jadi bentuk ini belum tentu sesuai lapangan.`;
}

function LoadingSkeleton() {
  return (
    <div
      className="flex flex-1 min-h-0 flex-col @3xl:flex-row"
      aria-busy="true"
      aria-label="Memuat data simulasi"
    >
      <div className="flex-1 min-h-[220px] m-4 rounded-xl bg-[#f3f4f6] animate-pulse motion-reduce:animate-none" />
      <div className="shrink-0 space-y-3 p-4 @3xl:w-80">
        <div className="h-16 rounded-xl bg-[#f3f4f6] animate-pulse motion-reduce:animate-none" />
        <div className="h-24 rounded-xl bg-[#f3f4f6] animate-pulse motion-reduce:animate-none" />
        <div className="h-24 rounded-xl bg-[#f3f4f6] animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 min-h-0 items-center justify-center p-6">
      <div className="max-w-sm text-center" role="alert">
        <p className="text-sm font-semibold text-[#111827]">
          Data simulasi tidak dapat dimuat
        </p>
        <p className="mt-1 text-xs text-[#6B7280]">
          {message}. Periksa koneksi ke server, lalu coba lagi. Peta dan data
          lain tidak terpengaruh.
        </p>
        <Button className="mt-4" onClick={onRetry}>
          Coba lagi
        </Button>
      </div>
    </div>
  );
}

/** Dicek sekali saat panel dibuka; tanpa WebGL panel tetap jalan tanpa tampilan 3D. */
function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function NoWebGL() {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div className="max-w-xs text-center">
        <p className="text-sm font-semibold text-[#111827]">
          Tampilan 3D tidak tersedia
        </p>
        <p className="mt-1 text-xs text-[#6B7280]">
          Browser atau perangkat ini tidak mendukung WebGL. Simulasi tetap
          berjalan: diagram fase dan metrik di samping tetap diperbarui.
        </p>
      </div>
    </div>
  );
}

/** Siluet samping tiap jenis kendaraan (sama dengan bentuknya di scene). */
const VEHICLE_SHAPES: Record<
  VehicleType,
  { width: number; rects: [x: number, y: number, w: number, h: number, glass?: boolean][] }
> = {
  motor: { width: 12, rects: [[1, 8, 10, 3], [4, 3, 3, 5, true]] },
  mobil: { width: 20, rects: [[0, 7, 20, 4], [5, 3, 10, 4, true]] },
  bus: { width: 38, rects: [[0, 2, 38, 9], [2, 4, 34, 3, true]] },
  truk: { width: 30, rects: [[0, 2, 21, 9], [22, 4, 8, 7, true]] },
};

function VehicleLegend() {
  return (
    <section aria-label="Legenda jenis kendaraan">
      <h3 className="text-xs font-semibold text-[#111827]">Jenis kendaraan</h3>
      <ul className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1.5">
        {VEHICLE_TYPES.map((type) => {
          const shape = VEHICLE_SHAPES[type];
          return (
            <li
              key={type}
              className="flex items-end gap-1.5 text-xs text-[#374151]"
            >
              <svg
                width={shape.width}
                height={12}
                viewBox={`0 0 ${shape.width} 12`}
                aria-hidden="true"
              >
                {shape.rects.map(([x, y, w, h, glass], i) => (
                  <rect
                    key={i}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={1}
                    fill={glass ? "#9CA3AF" : "#374151"}
                  />
                ))}
              </svg>
              {VEHICLE_LABELS[type]}
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px] leading-snug text-[#6B7280]">
        Jenis dibedakan dari bentuk dan ukuran; warna kendaraan hanya variasi
        tampilan.
      </p>
    </section>
  );
}

export default function IntersectionSimPanel({
  node,
  arms,
  onClose,
}: IntersectionSimPanelProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [selectedTab, setSelectedTab] = useState<SimTab | null>(null);
  const [webgl] = useState(detectWebGL);
  const sim = useIntersectionSim(node, arms);
  const { input, frame } = sim;

  // Pindahkan fokus ke panel saat dibuka dan kembalikan saat ditutup.
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    panelRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const aiPlan = input?.plans.ai ?? null;
  const tab: SimTab = aiPlan ? (selectedTab ?? "ai") : "current";
  const scenePlans: PlanId[] =
    tab === "compare" ? ["current", "ai"] : [tab === "ai" ? "ai" : "current"];
  const unavailable = input ? aiUnavailableReason(input) : null;
  const note = input ? recommendationNote(input) : null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="@container absolute inset-0 z-[1000] flex flex-col bg-white outline-none animate-in fade-in-0 duration-150 motion-reduce:animate-none"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 bg-[#111827] px-4 py-3">
        <div className="min-w-0">
          <p
            id={titleId}
            className="truncate text-sm font-bold leading-tight text-white"
          >
            {node.name}
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Simulasi 3D Simpang
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Badge
            variant="outline"
            className="border-[#E48E07] text-[10px] font-semibold uppercase tracking-wider text-[#E48E07]"
          >
            Data demo
          </Badge>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup simulasi"
            className="rounded-md p-1 text-slate-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Tab mode + kontrol */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#e5e7eb] px-4 py-2">
        <Tabs
          value={tab}
          onValueChange={(value) => setSelectedTab(value as SimTab)}
          className="w-auto"
        >
          <TabsList>
            {(Object.keys(TAB_LABELS) as SimTab[]).map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                disabled={key !== "current" && !aiPlan}
                className="px-3 text-xs font-semibold"
              >
                {TAB_LABELS[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {sim.status === "ready" && (
          <SimControls
            playing={sim.playing}
            finished={sim.finished}
            speed={sim.speed}
            simTimeSec={frame.simTimeSec}
            onPlay={sim.play}
            onPause={sim.pause}
            onReset={sim.reset}
            onSpeed={sim.setSpeed}
          />
        )}
      </div>

      {unavailable && (
        <p className="shrink-0 border-b border-[#e5e7eb] bg-[#f9fafb] px-4 py-2 text-xs text-[#374151]">
          {unavailable}
        </p>
      )}

      {/* Isi */}
      {sim.status === "loading" && <LoadingSkeleton />}
      {sim.status === "error" && (
        <LoadError
          message={sim.error?.message ?? "Terjadi kesalahan"}
          onRetry={sim.retry}
        />
      )}
      {sim.status === "ready" && input && (
        <div className="flex flex-1 min-h-0 flex-col @3xl:flex-row">
          <div className="relative flex-1 min-h-[220px] min-w-0 bg-[#f3f4f6]">
            {webgl ? (
              // Bandingkan: dua canvas berdampingan, digerakkan jam simulasi yang sama.
              <div
                className={cn(
                  "absolute inset-0 grid gap-px bg-[#e5e7eb]",
                  tab === "compare" ? "grid-cols-2" : "grid-cols-1",
                )}
              >
                {scenePlans.map((planId) => (
                  <div key={planId} className="relative min-w-0 bg-[#f3f4f6]">
                    <IntersectionScene
                      input={input}
                      planId={planId}
                      engines={sim.engines}
                      playing={sim.playing}
                      redrawToken={String(sim.resetCount)}
                      label={tab === "compare" ? TAB_LABELS[planId] : undefined}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <NoWebGL />
            )}
          </div>

          <aside className="max-h-[45%] shrink-0 space-y-4 overflow-y-auto border-t border-[#e5e7eb] p-4 @3xl:max-h-none @3xl:w-80 @3xl:border-l @3xl:border-t-0">
            {aiPlan && input.recommendation.raw && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-700">
                  Rekomendasi AI
                </p>
                <p className="mt-1 text-xs font-medium text-yellow-800">
                  {input.recommendation.raw}
                </p>
                {note && (
                  <p className="mt-1 text-[11px] leading-snug text-yellow-800">
                    {note}
                  </p>
                )}
              </div>
            )}

            {(tab === "current" || tab === "compare") && (
              <PhaseDiagram
                plan={input.plans.current}
                simTimeSec={frame.simTimeSec}
              />
            )}
            {aiPlan && (tab === "ai" || tab === "compare") && (
              <PhaseDiagram
                plan={aiPlan}
                baseline={input.plans.current}
                simTimeSec={frame.simTimeSec}
              />
            )}

            {tab === "compare" ? (
              <MetricCards
                approaches={input.geometry.approaches}
                comparing
                metrics={frame.current}
                compareWith={frame.ai}
              />
            ) : (
              <MetricCards
                approaches={input.geometry.approaches}
                metrics={tab === "ai" ? frame.ai : frame.current}
              />
            )}

            <p className="text-[11px] leading-snug text-[#6B7280]">
              {junctionNote(input)}
            </p>

            <VehicleLegend />
          </aside>
        </div>
      )}

      {/* Disclaimer */}
      <div className="shrink-0 border-t border-[#e5e7eb] bg-[#f9fafb] px-4 py-2 text-[11px] leading-snug text-[#6B7280]">
        <span className="font-semibold text-[#374151]">
          Simulasi, bukan kontrol langsung sinyal lapangan.
        </span>{" "}
        Durasi fase eksisting, volume, jumlah lajur, dan komposisi kendaraan
        adalah data demo.
        {input && <span className="tabular-nums"> Seed {input.seed}.</span>}
      </div>
    </div>
  );
}
