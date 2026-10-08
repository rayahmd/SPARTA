"use client";
import { useEffect, useMemo } from "react";
import type { RefObject } from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import type { Camera } from "three";
import type { SimEngines } from "@/lib/hooks/useIntersectionSim";
import { buildLayout } from "@/lib/sim/layout";
import type { IntersectionSimInput, PlanId } from "@/lib/sim/types";
import { RoadGeometry } from "./scene/RoadGeometry";
import { Scenery } from "./scene/Scenery";
import { SignalHeads } from "./scene/SignalHeads";
import { VehicleInstances } from "./scene/VehicleInstances";
import { SCENE_COLORS } from "./simTheme";

// Sudut pandang isometrik dari tenggara, mengikuti gambar referensi.
const CAMERA_DIRECTION: [number, number, number] = [86, 82, 86];
const CAMERA_DISTANCE = Math.hypot(...CAMERA_DIRECTION);
/** Di bawah rasio ini (canvas tinggi-sempit) kamera dimundurkan supaya simpang tetap utuh. */
const MIN_FULL_ASPECT = 1.15;

function setCameraDistance(camera: Camera, distance: number) {
  camera.position.setLength(distance);
}

/** Menyesuaikan jarak kamera dengan bentuk canvas (mis. dua canvas sempit di mode Bandingkan). */
function FitCamera() {
  const camera = useThree((state) => state.camera);
  const aspect = useThree((state) => state.size.width / state.size.height);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!Number.isFinite(aspect) || aspect <= 0) return;
    setCameraDistance(
      camera,
      CAMERA_DISTANCE * Math.max(1, MIN_FULL_ASPECT / aspect),
    );
    invalidate();
  }, [camera, aspect, invalidate]);
  return null;
}

/** Saat jeda canvas hanya digambar bila diminta; ini memintanya saat token berubah. */
function RedrawOnChange({ token }: { token: string }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
  }, [token, invalidate]);
  return null;
}

interface IntersectionSceneProps {
  input: IntersectionSimInput;
  planId: PlanId;
  engines: RefObject<SimEngines>;
  playing: boolean;
  /** Berubah saat scene perlu digambar ulang dalam keadaan jeda (mis. setelah reset). */
  redrawToken: string;
  /** Label kecil di pojok canvas (dipakai mode Bandingkan). */
  label?: string;
}

export function IntersectionScene({
  input,
  planId,
  engines,
  playing,
  redrawToken,
  label,
}: IntersectionSceneProps) {
  const layout = useMemo(() => buildLayout(input.geometry), [input.geometry]);
  const plan = planId === "ai" ? input.plans.ai : input.plans.current;
  if (!plan) return null;

  return (
    <div className="absolute inset-0">
      <Canvas
        role="img"
        aria-label={`Tampilan 3D simpang ${input.node.name}, ${plan.label}`}
        flat
        frameloop={playing ? "always" : "demand"}
        dpr={[1, 1.5]}
        camera={{ position: CAMERA_DIRECTION, fov: 30, near: 1, far: 2500 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={[SCENE_COLORS.background]} />
        <ambientLight intensity={2.1} />
        <directionalLight position={[70, 140, 40]} intensity={1.5} />

        <Scenery layout={layout} seed={input.seed} />
        <RoadGeometry layout={layout} />
        <SignalHeads
          layout={layout}
          plan={plan}
          planId={planId}
          engines={engines}
        />
        <VehicleInstances planId={planId} engines={engines} />

        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={45}
          maxDistance={520}
          minPolarAngle={0.12}
          maxPolarAngle={1.28}
        />
        <FitCamera />
        <RedrawOnChange token={`${redrawToken}:${planId}`} />
      </Canvas>
      {label && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-[#e5e7eb] bg-white px-2 py-1 text-[11px] font-semibold text-[#111827]">
          {label}
        </div>
      )}
    </div>
  );
}
