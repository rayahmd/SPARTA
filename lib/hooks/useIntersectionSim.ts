import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { SIM_DT, createSim, resetSim, stepSim } from "@/lib/sim/engine";
import type { SimState } from "@/lib/sim/engine";
import { readMetrics } from "@/lib/sim/metrics";
import type {
  DetectedArm,
  IntersectionSimInput,
  SimMetrics,
  TrafficNodeSnapshot,
} from "@/lib/sim/types";

export type SimStatus = "loading" | "error" | "ready";

export const SIM_SPEEDS = [1, 2, 4, 8] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];

/** Simulasi berhenti otomatis setelah satu jam waktu simulasi. */
export const SIM_MAX_SEC = 3600;

/** Engine untuk tiap rencana sinyal; `ai` null bila tidak ada rencana AI. */
export interface SimEngines {
  current: SimState | null;
  ai: SimState | null;
}

/** Cuplikan untuk UI, diperbarui paling sering 4 kali per detik. */
export interface SimFrame {
  simTimeSec: number;
  current: SimMetrics | null;
  ai: SimMetrics | null;
}

const EMPTY_FRAME: SimFrame = { simTimeSec: 0, current: null, ai: null };
const MAX_SUBSTEPS_PER_FRAME = 60;
const PUBLISH_INTERVAL_MS = 250;

function buildSimUrl(
  node: TrafficNodeSnapshot,
  arms: DetectedArm[] | null | undefined,
): string {
  const query = new URLSearchParams({
    name: node.name,
    lat: String(node.lat),
    lng: String(node.lng),
    currentLevel: String(node.currentLevel),
    predicted30: String(node.predicted30),
    confidence: String(node.confidence),
    // Kosong = "tidak ada rekomendasi" menurut snapshot yang dilihat operator.
    recommendation: node.recommendation ?? "",
  });
  // Bentuk simpang dari data jalan di peta: "arah:kelas:jumlahGaris,..."
  if (arms && arms.length > 0) {
    query.set(
      "arms",
      arms
        .map((a) => `${Math.round(a.bearingDeg)}:${a.roadClass}:${a.carriageways}`)
        .join(","),
    );
  }
  return `/api/traffic-nodes/${encodeURIComponent(node.id)}/simulation?${query}`;
}

async function fetchSimInput(url: string): Promise<IntersectionSimInput> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Server menjawab HTTP ${res.status}`);
  }
  return res.json();
}

function readFrame(engines: SimEngines): SimFrame {
  if (!engines.current) return EMPTY_FRAME;
  return {
    simTimeSec: engines.current.time,
    current: readMetrics(engines.current),
    ai: engines.ai ? readMetrics(engines.ai) : null,
  };
}

export function useIntersectionSim(
  node: TrafficNodeSnapshot,
  arms?: DetectedArm[] | null,
) {
  // Snapshot dibekukan saat panel dibuka supaya polling node di halaman induk
  // tidak mengganti input di tengah simulasi.
  const [snapshot] = useState(node);
  const [junctionArms] = useState(arms);

  const { data, error, mutate } = useSWR<IntersectionSimInput, Error>(
    buildSimUrl(snapshot, junctionArms),
    fetchSimInput,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    },
  );

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState<SimSpeed>(1);
  const [frame, setFrame] = useState<SimFrame>(EMPTY_FRAME);
  const [resetCount, setResetCount] = useState(0);

  // State engine dimutasi di luar React (posisi kendaraan tidak pernah masuk
  // React state). Kedua rencana selalu dijalankan bersama dengan jam dan seed
  // yang sama, jadi berpindah tab tidak mengulang simulasi.
  const enginesRef = useRef<SimEngines>({ current: null, ai: null });
  const speedRef = useRef<SimSpeed>(1);

  useEffect(() => {
    if (!data) return;
    enginesRef.current = {
      current: createSim(data, "current"),
      ai: data.plans.ai ? createSim(data, "ai") : null,
    };
    return () => {
      enginesRef.current = { current: null, ai: null };
    };
  }, [data]);

  // Loop fixed-timestep: waktu nyata × kecepatan diakumulasi lalu dihabiskan
  // dalam langkah SIM_DT.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last: number | null = null;
    let acc = 0;
    let lastPublish = 0;

    const tick = (now: number) => {
      const engines = enginesRef.current;
      if (!engines.current) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (last === null) last = now;
      // Dibatasi supaya tab yang lama tidak aktif tidak memicu lompatan besar.
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dtReal * speedRef.current;

      let steps = 0;
      while (acc >= SIM_DT && steps < MAX_SUBSTEPS_PER_FRAME) {
        stepSim(engines.current, SIM_DT);
        if (engines.ai) stepSim(engines.ai, SIM_DT);
        acc -= SIM_DT;
        steps++;
      }
      if (steps === MAX_SUBSTEPS_PER_FRAME) acc = 0;

      const finished = engines.current.time >= SIM_MAX_SEC;
      if (finished || now - lastPublish >= PUBLISH_INTERVAL_MS) {
        lastPublish = now;
        setFrame(readFrame(engines));
      }
      if (finished) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const finished = frame.simTimeSec >= SIM_MAX_SEC;

  return {
    status: (data ? "ready" : error ? "error" : "loading") as SimStatus,
    error: error ?? null,
    retry: () => {
      void mutate();
    },
    input: data ?? null,
    playing,
    speed,
    finished,
    frame,
    /** Bertambah tiap reset; dipakai scene untuk menggambar ulang saat jeda. */
    resetCount,
    engines: enginesRef,
    play: () => {
      if (!finished) setPlaying(true);
    },
    pause: () => {
      setPlaying(false);
      setFrame(readFrame(enginesRef.current));
    },
    reset: () => {
      const engines = enginesRef.current;
      if (engines.current) resetSim(engines.current);
      if (engines.ai) resetSim(engines.ai);
      setPlaying(false);
      setFrame(EMPTY_FRAME);
      setResetCount((n) => n + 1);
    },
    setSpeed: (next: SimSpeed) => {
      speedRef.current = next;
      setSpeedState(next);
    },
  };
}

export type IntersectionSim = ReturnType<typeof useIntersectionSim>;
