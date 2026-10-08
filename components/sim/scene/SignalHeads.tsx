"use client";
import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { MeshBasicMaterial } from "three";
import type { SimEngines } from "@/lib/hooks/useIntersectionSim";
import type { IntersectionLayout } from "@/lib/sim/layout";
import { colorForApproach, signalAt } from "@/lib/sim/signal";
import type { PlanId, SignalColor, SignalPlan } from "@/lib/sim/types";
import { SCENE_COLORS, SIGNAL_COLORS } from "../simTheme";
import { armRotation } from "./RoadGeometry";

const LAMP_ORDER: SignalColor[] = ["red", "yellow", "green"];
const LAMP_HEIGHTS = [8.6, 7.3, 6.0];

interface SignalHeadsProps {
  layout: IntersectionLayout;
  plan: SignalPlan;
  planId: PlanId;
  engines: RefObject<SimEngines>;
}

/**
 * Lampu lalu lintas per pendekat. Garis henti ikut diwarnai sesuai lampu
 * (seperti di SUMO) supaya fase terbaca dari sudut pandang atas.
 */
export function SignalHeads({ layout, plan, planId, engines }: SignalHeadsProps) {
  // Warna pada t = 0, dipakai sebelum engine siap.
  const initialColors = useMemo(() => {
    const state = signalAt(plan, 0);
    return layout.arms.map((arm) => colorForApproach(plan, state, arm.id));
  }, [layout, plan]);

  // lampRefs[lengan][0..2] = merah, kuning, hijau; stopLineRefs[lengan] = garis henti.
  const lampRefs = useRef<(MeshBasicMaterial | null)[][]>([]);
  const stopLineRefs = useRef<(MeshBasicMaterial | null)[]>([]);
  const lastColors = useRef<(SignalColor | null)[]>([]);

  useFrame(() => {
    const engine = engines.current?.[planId] ?? null;
    for (let a = 0; a < layout.arms.length; a++) {
      const color = engine ? engine.colors[a] : initialColors[a];
      if (lastColors.current[a] === color) continue;
      lastColors.current[a] = color;
      const lamps = lampRefs.current[a];
      if (lamps) {
        for (let i = 0; i < LAMP_ORDER.length; i++) {
          lamps[i]?.color.set(
            LAMP_ORDER[i] === color ? SIGNAL_COLORS[color] : SCENE_COLORS.lampOff,
          );
        }
      }
      stopLineRefs.current[a]?.color.set(SIGNAL_COLORS[color]);
    }
  });

  return (
    <group>
      {layout.arms.map((arm, a) => {
        // Tiang di trotoar kiri lajur masuk, sejajar garis henti.
        const poleX = arm.ox * arm.stopDist + arm.inLeftX * (arm.halfWidth + 1.3);
        const poleY = arm.oy * arm.stopDist + arm.inLeftY * (arm.halfWidth + 1.3);
        const lineX = arm.ox * arm.stopDist + (arm.inLeftX * arm.halfWidth) / 2;
        const lineY = arm.oy * arm.stopDist + (arm.inLeftY * arm.halfWidth) / 2;
        return (
          <group key={arm.id}>
            <mesh position={[poleX, 2.7, -poleY]}>
              <cylinderGeometry args={[0.2, 0.2, 5.4, 10]} />
              <meshLambertMaterial color={SCENE_COLORS.pole} />
            </mesh>
            {/* Rumah lampu (silinder supaya lampu terlihat dari semua arah) */}
            <mesh position={[poleX, 7.3, -poleY]}>
              <cylinderGeometry args={[0.55, 0.55, 4.4, 14]} />
              <meshLambertMaterial color={SCENE_COLORS.lampOff} />
            </mesh>
            {LAMP_ORDER.map((lamp, i) => (
              <mesh key={lamp} position={[poleX, LAMP_HEIGHTS[i], -poleY]}>
                <sphereGeometry args={[0.74, 16, 12]} />
                <meshBasicMaterial
                  ref={(material) => {
                    (lampRefs.current[a] ??= [])[i] = material;
                  }}
                  color={
                    lamp === initialColors[a]
                      ? SIGNAL_COLORS[lamp]
                      : SCENE_COLORS.lampOff
                  }
                />
              </mesh>
            ))}
            {/* Garis henti berwarna sinyal */}
            <mesh
              position={[lineX, 0.07, -lineY]}
              rotation={[0, armRotation(arm), 0]}
            >
              <boxGeometry args={[0.8, 0.02, arm.halfWidth]} />
              <meshBasicMaterial
                ref={(material) => {
                  stopLineRefs.current[a] = material;
                }}
                color={SIGNAL_COLORS[initialColors[a]]}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
