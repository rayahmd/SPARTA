import { Ambulance, X } from "lucide-react";

// Isi popup ambulans Vanguard di peta. Sama seperti NodePopupCard: dirender
// jadi HTML statis (renderToString) di DigitalTwinMapInner, jadi tanpa hook
// atau event handler React; tombol tutup memakai atribut `data-action`.

export interface VehiclePopupVehicle {
  id: string;
  label: string;
  progress: number;
  etaMinutes: number;
  distanceKm: number;
  greenWaveOn: boolean;
}

export interface VehiclePopupCardProps {
  vehicle: VehiclePopupVehicle;
  /** Animasi masuk hanya saat popup dibuka, bukan tiap data diperbarui. */
  animated?: boolean;
}

function StatTile({
  label,
  value,
  unit,
  tone = "neutral",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "neutral" | "green";
}) {
  const green = tone === "green";
  return (
    <div
      className={`rounded-lg px-1.5 py-1.5 text-center ${green ? "bg-green-50" : "bg-slate-50"}`}
    >
      <p
        className={`truncate text-[9px] font-bold uppercase leading-3 tracking-wide ${green ? "text-green-700" : "text-slate-500"}`}
      >
        {label}
      </p>
      <p
        className={`mt-0.5 text-base font-bold leading-5 tabular-nums ${green ? "text-green-700" : "text-[#111827]"}`}
      >
        {value}
        {unit && (
          <span className="ml-0.5 text-[10px] font-semibold text-slate-500">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

export function VehiclePopupCard({
  vehicle,
  animated = false,
}: VehiclePopupCardProps) {
  const percent = Math.max(0, Math.min(100, Math.round(vehicle.progress * 100)));

  return (
    <div
      className={`w-[272px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white font-sans text-[#111827] shadow-xl ${animated ? "animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none" : ""}`}
    >
      <div className="space-y-2.5 p-3">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#8F1610]">
            <Ambulance size={18} className="text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold leading-5">
              {vehicle.label}
            </h3>
            <p className="flex items-center gap-1.5 text-[11px] leading-4 text-slate-500">
              <span>SPARTA Vanguard</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                ID {vehicle.id.slice(-6).toUpperCase()}
              </span>
            </p>
          </div>
          <button
            type="button"
            data-action="close"
            aria-label="Tutup"
            className="-mr-1 shrink-0 cursor-pointer self-start rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>

        {/* Stat */}
        <div className="grid grid-cols-3 gap-1.5">
          <StatTile
            label="ETA"
            value={vehicle.etaMinutes.toFixed(0)}
            unit="mnt"
          />
          <StatTile label="Jarak" value={`${vehicle.distanceKm}`} unit="km" />
          <StatTile
            label="Green Wave"
            value={vehicle.greenWaveOn ? "Aktif" : "Off"}
            tone={vehicle.greenWaveOn ? "green" : "neutral"}
          />
        </div>

        {/* Progres perjalanan */}
        <div>
          <div className="flex items-center justify-between text-[11px] leading-4">
            <span className="font-semibold text-slate-500">
              Progres perjalanan
            </span>
            <span className="font-bold tabular-nums">{percent}%</span>
          </div>
          <div
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label={`Progres perjalanan ${percent}%`}
          >
            <div
              className="h-full rounded-full bg-[#16A34A]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
