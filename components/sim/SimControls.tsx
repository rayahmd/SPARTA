"use client";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SIM_SPEEDS } from "@/lib/hooks/useIntersectionSim";
import type { SimSpeed } from "@/lib/hooks/useIntersectionSim";
import { cn } from "@/lib/utils";
import { formatClock } from "./simTheme";

interface SimControlsProps {
  playing: boolean;
  finished: boolean;
  speed: SimSpeed;
  simTimeSec: number;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSpeed: (speed: SimSpeed) => void;
}

export function SimControls({
  playing,
  finished,
  speed,
  simTimeSec,
  onPlay,
  onPause,
  onReset,
  onSpeed,
}: SimControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        className="w-[76px] font-semibold"
        onClick={playing ? onPause : onPlay}
        disabled={finished}
      >
        {playing ? <Pause /> : <Play />}
        {playing ? "Jeda" : "Putar"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="font-semibold"
        onClick={onReset}
        disabled={simTimeSec === 0 && !playing}
      >
        <RotateCcw />
        Reset
      </Button>

      <div
        role="group"
        aria-label="Kecepatan simulasi"
        className="flex items-center rounded-lg bg-muted p-[3px]"
      >
        {SIM_SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={speed === s}
            onClick={() => onSpeed(s)}
            className={cn(
              "h-[22px] min-w-8 rounded-md px-1.5 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
              speed === s
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground/60 hover:text-foreground",
            )}
          >
            {s}×
          </button>
        ))}
      </div>

      <div className="flex items-baseline gap-1.5 pl-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
          Waktu
        </span>
        <span
          className="text-sm font-semibold tabular-nums text-[#111827]"
          aria-label={`Waktu simulasi ${formatClock(simTimeSec)}`}
        >
          {formatClock(simTimeSec)}
        </span>
        {finished && (
          <span className="text-[11px] text-[#6B7280]">selesai · tekan Reset</span>
        )}
      </div>
    </div>
  );
}
