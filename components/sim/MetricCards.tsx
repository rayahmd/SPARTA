"use client";
import type { SimMetrics } from "@/lib/sim/types";
import { cn } from "@/lib/utils";
import { formatNumber } from "./simTheme";

interface MetricDef {
  key: "queueAvg" | "queueMax" | "delayAvgSec" | "throughputVph";
  label: string;
  unit: string;
  decimals: 0 | 1;
  lowerIsBetter: boolean;
}

const METRICS: MetricDef[] = [
  {
    key: "queueAvg",
    label: "Antrean rata-rata",
    unit: "kend",
    decimals: 1,
    lowerIsBetter: true,
  },
  {
    key: "queueMax",
    label: "Antrean maksimum",
    unit: "kend",
    decimals: 0,
    lowerIsBetter: true,
  },
  {
    key: "delayAvgSec",
    label: "Tundaan rata-rata",
    unit: "dtk/kend",
    decimals: 1,
    lowerIsBetter: true,
  },
  {
    key: "throughputVph",
    label: "Throughput",
    unit: "kend/jam",
    decimals: 0,
    lowerIsBetter: false,
  },
];

export function DeltaBadge({
  base,
  value,
  lowerIsBetter,
}: {
  base: number;
  value: number;
  lowerIsBetter: boolean;
}) {
  const diff = value - base;
  const pct = base > 0 ? Math.round((diff / base) * 100) : null;
  if (pct === 0 || (pct === null && diff === 0)) {
    return (
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
        sama
      </span>
    );
  }
  const improved = lowerIsBetter ? diff < 0 : diff > 0;
  const sign = diff > 0 ? "+" : "−";
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
        improved ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
      )}
    >
      {pct === null ? `${sign}${formatNumber(Math.abs(diff), 1)}` : `${sign}${Math.abs(pct)}%`}
      <span className="sr-only">{improved ? " membaik" : " memburuk"}</span>
    </span>
  );
}

interface MetricCardsProps {
  /** Pendekat simpang, urut searah jarum jam. */
  approaches: { id: string; label: string }[];
  /** Metrik rencana yang ditampilkan (atau kondisi saat ini pada mode bandingkan). */
  metrics: SimMetrics | null;
  /** Bila diisi, kartu menampilkan perbandingan kondisi saat ini → rekomendasi AI. */
  compareWith?: SimMetrics | null;
  comparing?: boolean;
}

export function MetricCards({
  approaches,
  metrics,
  compareWith,
  comparing,
}: MetricCardsProps) {
  return (
    <section aria-label="Metrik simulasi">
      <h3 className="text-xs font-semibold text-[#111827]">
        {comparing ? "Metrik: saat ini → rekomendasi AI" : "Metrik"}
      </h3>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {METRICS.map((def) => {
          const value = metrics?.[def.key] ?? 0;
          const other = compareWith?.[def.key] ?? 0;
          return (
            <div
              key={def.key}
              className="rounded-lg border border-[#e5e7eb] bg-white p-2.5"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                {def.label}
              </p>
              {comparing ? (
                <>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-1 text-sm font-semibold tabular-nums text-[#111827]">
                    <span className="text-[#6B7280]">
                      {formatNumber(value, def.decimals)}
                    </span>
                    <span className="text-slate-400" aria-hidden="true">
                      →
                    </span>
                    <span className="sr-only">menjadi</span>
                    <span>{formatNumber(other, def.decimals)}</span>
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <span className="text-[10px] text-[#6B7280]">{def.unit}</span>
                    <DeltaBadge
                      base={value}
                      value={other}
                      lowerIsBetter={def.lowerIsBetter}
                    />
                  </div>
                </>
              ) : (
                <p className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-semibold leading-none tabular-nums text-[#111827]">
                    {formatNumber(value, def.decimals)}
                  </span>
                  <span className="text-[10px] text-[#6B7280]">{def.unit}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Antrean per pendekat */}
      <table className="mt-3 w-full text-xs tabular-nums">
        <caption className="sr-only">Antrean per pendekat</caption>
        <thead>
          <tr className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
            <th scope="col" className="py-1 text-left font-bold">
              Pendekat
            </th>
            <th scope="col" className="py-1 text-right font-bold">
              {comparing ? "Antre kini" : "Antre"}
            </th>
            <th scope="col" className="py-1 text-right font-bold">
              {comparing ? "Antre AI" : "Maks"}
            </th>
          </tr>
        </thead>
        <tbody>
          {approaches.map(({ id, label }) => (
            <tr key={id} className="border-t border-[#e5e7eb] text-[#374151]">
              <th scope="row" className="py-1 text-left font-medium">
                {label}
              </th>
              <td className="py-1 text-right">
                {metrics?.perApproach[id]?.queueNow ?? 0}
              </td>
              <td className="py-1 text-right">
                {comparing
                  ? (compareWith?.perApproach[id]?.queueNow ?? 0)
                  : (metrics?.perApproach[id]?.queueMax ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
