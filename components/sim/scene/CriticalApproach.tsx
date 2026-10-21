"use client";
import { DoubleSide } from "three";
import type { IntersectionLayout } from "@/lib/sim/layout";
import { armRotation } from "./RoadGeometry";

/** Panjang sorotan dari garis henti ke hulu (m). */
const ZONE_LENGTH = 70;

interface CriticalApproachProps {
  layout: IntersectionLayout;
  approachId: string;
  color: string;
}

/**
 * Sorotan transparan di lajur masuk pendekat kritis, supaya mata langsung
 * tertuju ke antrean yang diubah rekomendasi AI.
 */
export function CriticalApproach({ layout, approachId, color }: CriticalApproachProps) {
  const arm = layout.arms.find((a) => a.id === approachId);
  if (!arm) return null;
  const length = Math.min(ZONE_LENGTH, arm.endDist - arm.stopDist);
  const along = arm.stopDist + length / 2;
  const x = arm.ox * along + (arm.inLeftX * arm.halfWidth) / 2;
  const y = arm.oy * along + (arm.inLeftY * arm.halfWidth) / 2;
  return (
    <mesh position={[x, 0.06, -y]} rotation={[0, armRotation(arm), 0]}>
      <boxGeometry args={[length, 0.02, arm.halfWidth]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.32}
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}
