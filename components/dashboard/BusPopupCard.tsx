import { BusFront, MapPin, X } from "lucide-react";

// Isi popup Suroboyo Bus dan halte di peta. Sama seperti VehiclePopupCard:
// dirender jadi HTML statis (renderToString) di DigitalTwinMapInner, jadi tanpa
// hook atau event handler React; tombol tutup memakai atribut `data-action`.

const CARD_CLASS =
  "w-[272px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-slate-200 bg-white font-sans text-[#111827] shadow-xl";
const ENTER_CLASS =
  "animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none";

function CloseButton() {
  return (
    <button
      type="button"
      data-action="close"
      aria-label="Tutup"
      className="-mr-1 shrink-0 cursor-pointer self-start rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
    >
      <X size={16} />
    </button>
  );
}

function RouteChip({ id, color }: { id: string; color: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1.5 text-[10px] font-bold leading-4 text-white"
      style={{ background: color }}
    >
      {id}
    </span>
  );
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
  tone?: "neutral" | "green" | "amber";
}) {
  const box =
    tone === "green" ? "bg-green-50" : tone === "amber" ? "bg-amber-50" : "bg-slate-50";
  const labelColor =
    tone === "green" ? "text-green-700" : tone === "amber" ? "text-amber-700" : "text-slate-500";
  const valueColor =
    tone === "green" ? "text-green-700" : tone === "amber" ? "text-amber-700" : "text-[#111827]";
  return (
    <div className={`rounded-lg px-1.5 py-1.5 text-center ${box}`}>
      <p className={`truncate text-[9px] font-bold uppercase leading-3 tracking-wide ${labelColor}`}>
        {label}
      </p>
      <p className={`mt-0.5 truncate text-base font-bold leading-5 tabular-nums ${valueColor}`}>
        {value}
        {unit && (
          <span className="ml-0.5 text-[10px] font-semibold text-slate-500">{unit}</span>
        )}
      </p>
    </div>
  );
}

export interface BusPopupCardProps {
  code: string;
  routeId: string;
  routeColor: string;
  /** Tujuan akhir arah yang sedang dijalani. */
  destination: string;
  late: boolean;
  /** Selisih jadwal untuk tile, mis. "Tepat" atau "+90 dtk". */
  scheduleLabel: string;
  speedKmh: number;
  /** Halte tempat bus sedang berhenti, bila ada. */
  dwellingAt: string | null;
  /** Halte berikutnya, terdekat lebih dulu. */
  stops: { name: string; eta: string }[];
  /** Animasi masuk hanya saat popup dibuka, bukan tiap data diperbarui. */
  animated?: boolean;
}

export function BusPopupCard({
  code,
  routeId,
  routeColor,
  destination,
  late,
  scheduleLabel,
  speedKmh,
  dwellingAt,
  stops,
  animated = false,
}: BusPopupCardProps) {
  return (
    <div className={`${CARD_CLASS} ${animated ? ENTER_CLASS : ""}`}>
      <div className="space-y-2.5 p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#8F1610]">
            <BusFront size={18} className="text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold leading-5">Suroboyo Bus {code}</h3>
            <p className="flex items-center gap-1.5 text-[11px] leading-4 text-slate-500">
              <RouteChip id={routeId} color={routeColor} />
              <span className="truncate">Menuju {destination}</span>
            </p>
          </div>
          <CloseButton />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <StatTile label="Berikutnya" value={stops[0]?.eta ?? "—"} />
          <StatTile label="Kecepatan" value={`${Math.round(speedKmh)}`} unit="km/j" />
          <StatTile label="Jadwal" value={scheduleLabel} tone={late ? "amber" : "green"} />
        </div>

        <div>
          <p className="text-[11px] font-semibold leading-4 text-slate-500">
            {dwellingAt ? `Berhenti di halte ${dwellingAt}` : "Halte berikutnya"}
          </p>
          <ul className="mt-1 space-y-0.5">
            {stops.map((stop) => (
              <li
                key={stop.name}
                className="flex items-center justify-between gap-2 text-xs leading-5"
              >
                <span className="truncate">{stop.name}</span>
                <span className="shrink-0 font-bold tabular-nums">{stop.eta}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export interface BusStopPopupCardProps {
  name: string;
  routes: { id: string; color: string }[];
  /** Kedatangan berikutnya, terdekat lebih dulu. */
  arrivals: {
    code: string;
    routeId: string;
    routeColor: string;
    destination: string;
    eta: string;
    late: boolean;
  }[];
  animated?: boolean;
}

export function BusStopPopupCard({
  name,
  routes,
  arrivals,
  animated = false,
}: BusStopPopupCardProps) {
  return (
    <div className={`${CARD_CLASS} ${animated ? ENTER_CLASS : ""}`}>
      <div className="space-y-2.5 p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
            <MapPin size={18} className="text-[#8F1610]" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-bold leading-5">Halte {name}</h3>
            <p className="flex items-center gap-1 text-[11px] leading-4 text-slate-500">
              {routes.map((route) => (
                <RouteChip key={route.id} id={route.id} color={route.color} />
              ))}
              <span className="ml-0.5 truncate">Suroboyo Bus</span>
            </p>
          </div>
          <CloseButton />
        </div>

        <div>
          <p className="text-[11px] font-semibold leading-4 text-slate-500">
            Kedatangan berikutnya
          </p>
          <ul className="mt-1 space-y-1">
            {arrivals.map((arrival) => (
              <li key={arrival.code} className="flex items-center gap-2 text-xs leading-5">
                <RouteChip id={arrival.routeId} color={arrival.routeColor} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-bold">{arrival.code}</span>
                  <span className="text-slate-500"> → {arrival.destination}</span>
                </span>
                {arrival.late && (
                  <span className="shrink-0 rounded bg-amber-50 px-1 text-[10px] font-bold leading-4 text-amber-700">
                    Telat
                  </span>
                )}
                <span className="shrink-0 font-bold tabular-nums">{arrival.eta}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
