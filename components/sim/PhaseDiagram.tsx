"use client";
import { signalAt } from "@/lib/sim/signal";
import type { SignalPlan } from "@/lib/sim/types";
import { cn } from "@/lib/utils";
import { SIGNAL_COLORS } from "./simTheme";

interface PhaseDiagramProps {
  plan: SignalPlan;
  /** Rencana pembanding; fase yang durasi hijaunya berbeda diberi tanda selisih. */
  baseline?: SignalPlan | null;
  simTimeSec: number;
}

const STAGE_TEXT = {
  green: "hijau",
  yellow: "kuning",
  allRed: "semua merah",
} as const;

function signed(value: number): string {
  return `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
}

export function PhaseDiagram({ plan, baseline, simTimeSec }: PhaseDiagramProps) {
  const state = signalAt(plan, simTimeSec);
  const cycle = plan.cycleSec;
  const cursorPct = cycle > 0 ? (state.cycleTimeSec / cycle) * 100 : 0;
  const cycleDelta = baseline ? plan.cycleSec - baseline.cycleSec : 0;
  const activePhase = plan.phases[state.phaseIndex];

  return (
    <section aria-label={`Diagram fase ${plan.label}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-[#111827]">{plan.label}</h3>
        <p className="text-[11px] tabular-nums text-[#6B7280]">
          Siklus {plan.cycleSec} dtk
          {cycleDelta !== 0 && (
            <span className="font-semibold text-[#111827]">
              {" "}
              ({signed(cycleDelta)})
            </span>
          )}
        </p>
      </div>

      {/* Batang fase: lebar segmen sebanding durasi */}
      <div className="relative mt-2" aria-hidden="true">
        <div className="flex h-3 overflow-hidden rounded-sm bg-[#e5e7eb]">
          {plan.phases.map((phase) => (
            <div
              key={phase.id}
              className="flex h-full border-r border-white last:border-r-0"
              style={{
                width: `${((phase.greenSec + phase.yellowSec + phase.allRedSec) / cycle) * 100}%`,
              }}
            >
              <div
                style={{ flex: phase.greenSec, background: SIGNAL_COLORS.green }}
              />
              <div
                style={{ flex: phase.yellowSec, background: SIGNAL_COLORS.yellow }}
              />
              <div
                style={{ flex: phase.allRedSec, background: SIGNAL_COLORS.red }}
              />
            </div>
          ))}
        </div>
        <div
          className="absolute -bottom-1 -top-1 w-0.5 -translate-x-1/2 rounded-full bg-[#111827]"
          style={{ left: `${cursorPct}%` }}
        />
      </div>

      <p className="mt-2.5 px-2 text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
        Durasi hijau
      </p>
      <ul className="mt-1 space-y-1">
        {plan.phases.map((phase, i) => {
          const active = i === state.phaseIndex;
          const base = baseline?.phases[i];
          const delta = base ? phase.greenSec - base.greenSec : 0;
          return (
            <li
              key={phase.id}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1 text-xs",
                active ? "bg-[#f3f4f6] text-[#111827]" : "text-[#374151]",
              )}
            >
              <span
                className={cn("w-20 shrink-0 truncate", active && "font-semibold")}
              >
                {phase.label}
              </span>
              <span className="tabular-nums">{phase.greenSec} dtk</span>
              {delta !== 0 && (
                <span className="rounded border border-yellow-200 bg-yellow-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-yellow-800">
                  {signed(delta)} dtk
                </span>
              )}
              {active && (
                <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[#6B7280]">
                  {STAGE_TEXT[state.stage]} · sisa{" "}
                  {Math.ceil(state.stageRemainingSec)} dtk
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="sr-only">
        Fase aktif: {activePhase?.label}, {STAGE_TEXT[state.stage]}.
      </p>
    </section>
  );
}
