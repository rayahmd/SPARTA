"use client";
import { useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DynamicDrawUsage, Object3D } from "three";
import type { InstancedMesh } from "three";
import type { SimEngines } from "@/lib/hooks/useIntersectionSim";
import { poseAt } from "@/lib/sim/layout";
import type { Pose } from "@/lib/sim/layout";
import type { PlanId, VehicleType } from "@/lib/sim/types";
import { SCENE_COLORS, VEHICLE_PALETTE } from "../simTheme";

/** Jumlah kendaraan maksimum per jenis; kendaraan di luar batas tidak digambar. */
const CAPACITY: Record<VehicleType, number> = {
  motor: 640,
  mobil: 384,
  bus: 64,
  truk: 96,
};

/**
 * Tiap jenis kendaraan disusun dari dua kotak (mis. badan + kabin) supaya
 * bentuknya terbaca, masing-masing satu InstancedMesh.
 * `offset` = geser pusat bagian sepanjang arah kendaraan (m, + ke depan).
 * `color` = warna tetap, atau "palette" bila diwarnai per kendaraan.
 */
interface PartDef {
  type: VehicleType;
  size: [length: number, height: number, width: number];
  offset: number;
  centerY: number;
  color: string;
}

const PARTS: PartDef[] = [
  // Motor: badan gelap + pengendara
  { type: "motor", size: [1.9, 0.6, 0.5], offset: 0, centerY: 0.5, color: SCENE_COLORS.motorBody },
  { type: "motor", size: [0.6, 0.95, 0.55], offset: -0.15, centerY: 1.25, color: "palette" },
  // Mobil: badan berwarna + kabin kaca
  { type: "mobil", size: [4.5, 0.85, 1.8], offset: 0, centerY: 0.6, color: "palette" },
  { type: "mobil", size: [2.3, 0.65, 1.6], offset: -0.3, centerY: 1.33, color: SCENE_COLORS.glass },
  // Bus: badan panjang + deret jendela
  { type: "bus", size: [12, 2.8, 2.5], offset: 0, centerY: 1.6, color: SCENE_COLORS.busBody },
  { type: "bus", size: [11, 0.95, 2.56], offset: 0, centerY: 2.2, color: SCENE_COLORS.glass },
  // Truk: kabin berwarna + bak
  { type: "truk", size: [2.3, 2.3, 2.3], offset: 3.35, centerY: 1.35, color: "palette" },
  { type: "truk", size: [6.5, 2.8, 2.4], offset: -1.25, centerY: 1.6, color: SCENE_COLORS.cargo },
];
const PARTS_PER_TYPE = 2;

// Objek sementara dipakai ulang tiap frame supaya tidak ada alokasi di loop render.
const scratch = new Object3D();
const pose: Pose = { x: 0, y: 0, heading: 0 };
const counts = [0, 0, 0, 0];
const PALETTE = VEHICLE_PALETTE.map((hex) => new Color(hex));

interface VehicleInstancesProps {
  planId: PlanId;
  engines: RefObject<SimEngines>;
}

export function VehicleInstances({ planId, engines }: VehicleInstancesProps) {
  const meshRefs = useRef<(InstancedMesh | null)[]>([]);

  useFrame(() => {
    const meshes = meshRefs.current;
    const engine = engines.current?.[planId] ?? null;
    counts[0] = counts[1] = counts[2] = counts[3] = 0;

    if (engine) {
      for (const lanes of engine.lanes) {
        for (const arr of lanes) {
          for (let i = 0; i < arr.length; i++) {
            const veh = arr[i];
            const t = veh.typeIndex;
            if (counts[t] >= CAPACITY[veh.type]) continue;
            const index = counts[t]++;
            // veh.s = bumper depan; badan digambar dari titik tengahnya.
            poseAt(veh.path, veh.s - veh.params.lengthM / 2, pose);
            const cos = Math.cos(pose.heading);
            const sin = Math.sin(pose.heading);
            scratch.rotation.set(0, pose.heading, 0);
            for (let k = 0; k < PARTS_PER_TYPE; k++) {
              const partIndex = t * PARTS_PER_TYPE + k;
              const mesh = meshes[partIndex];
              if (!mesh) continue;
              const part = PARTS[partIndex];
              scratch.position.set(
                pose.x + cos * part.offset,
                part.centerY,
                -(pose.y + sin * part.offset),
              );
              scratch.updateMatrix();
              mesh.setMatrixAt(index, scratch.matrix);
              if (part.color === "palette") {
                mesh.setColorAt(index, PALETTE[veh.id % PALETTE.length]);
              }
            }
          }
        }
      }
    }

    for (let partIndex = 0; partIndex < PARTS.length; partIndex++) {
      const mesh = meshes[partIndex];
      if (!mesh) continue;
      mesh.count = counts[Math.floor(partIndex / PARTS_PER_TYPE)];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      {PARTS.map((part, partIndex) => (
        <instancedMesh
          key={partIndex}
          ref={(mesh) => {
            meshRefs.current[partIndex] = mesh;
            if (mesh) {
              mesh.count = 0;
              mesh.instanceMatrix.setUsage(DynamicDrawUsage);
            }
          }}
          args={[undefined, undefined, CAPACITY[part.type]]}
          frustumCulled={false}
        >
          <boxGeometry args={part.size} />
          <meshLambertMaterial
            color={part.color === "palette" ? "#ffffff" : part.color}
          />
        </instancedMesh>
      ))}
    </group>
  );
}
