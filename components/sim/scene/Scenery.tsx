"use client";
import { useMemo } from "react";
import type { IntersectionLayout } from "@/lib/sim/layout";
import { mulberry32 } from "@/lib/sim/rng";
import { SCENE_COLORS } from "../simTheme";
import { ROAD_OVERRUN_M, SIDEWALK_WIDTH_M, armRotation } from "./RoadGeometry";
import { StaticInstances } from "./StaticInstances";
import type { InstanceTransform } from "./StaticInstances";

// Lingkungan di sekitar jalan (rumput, pohon, pagar tanaman, lampu jalan),
// mengikuti gaya gambar referensi. Murni dekorasi: tidak memengaruhi simulasi.
// Penempatan deterministik dari seed supaya scene sama tiap kali dibuka.

const TREE_SPACING_M = 15;
const LAMP_SPACING_M = 30;

interface SceneryItems {
  trunks: InstanceTransform[];
  crowns: InstanceTransform[];
  hedges: InstanceTransform[];
  lampPoles: InstanceTransform[];
  lampHeads: InstanceTransform[];
}

/**
 * true bila titik berada di badan jalan atau trotoar salah satu lengan
 * (lengan bisa berarah bebas, jadi dekorasi satu lengan bisa jatuh di lengan lain).
 */
function onRoad(
  layout: IntersectionLayout,
  x: number,
  y: number,
  margin: number,
  skipArm = -1,
): boolean {
  return layout.arms.some((arm) => {
    if (arm.index === skipArm) return false;
    const along = x * arm.ox + y * arm.oy;
    const lateral = Math.abs(x * arm.inLeftX + y * arm.inLeftY);
    return (
      along > -(arm.halfWidth + margin) &&
      along < arm.endDist + ROAD_OVERRUN_M &&
      lateral < arm.halfWidth + margin
    );
  });
}

function buildScenery(layout: IntersectionLayout, seed: number): SceneryItems {
  const rng = mulberry32(seed ^ 0x5eed1e);
  const items: SceneryItems = {
    trunks: [],
    crowns: [],
    hedges: [],
    lampPoles: [],
    lampHeads: [],
  };

  for (const arm of layout.arms) {
    const rot = armRotation(arm);
    const verge = arm.halfWidth + SIDEWALK_WIDTH_M;
    const sides: [number, number, number][] = [
      [arm.inLeftX, arm.inLeftY, arm.cornerIn],
      [arm.outLeftX, arm.outLeftY, arm.cornerOut],
    ];

    for (const [lx, ly, corner] of sides) {
      // Pohon berjajar di belakang trotoar, cukup jauh supaya tidak menutupi lajur.
      for (let d = corner + 13; d < arm.endDist + 6; d += TREE_SPACING_M) {
        const dist = d + (rng() - 0.5) * 4;
        const lateral = verge + 7 + rng() * 3;
        const size = 0.8 + rng() * 0.45;
        const x = arm.ox * dist + lx * lateral;
        const y = arm.oy * dist + ly * lateral;
        if (onRoad(layout, x, y, SIDEWALK_WIDTH_M + 3)) continue;
        items.trunks.push({ x, y, h: 1.1 * size, sx: size, sy: 2.2 * size, sz: size });
        items.crowns.push({
          x,
          y,
          h: 2.2 * size + 1.7 * size,
          sx: 2.3 * size,
          sy: 2.1 * size,
          sz: 2.3 * size,
        });
      }

      // Pagar tanaman rendah di tepi luar trotoar, berselang dengan pohon.
      for (let d = corner + 5; d + 8 < arm.endDist; d += TREE_SPACING_M) {
        const lateral = verge + 1.4;
        const at = (along: number): [number, number] => [
          arm.ox * along + lx * lateral,
          arm.oy * along + ly * lateral,
        ];
        const blocked = [d, d + 4, d + 8].some((along) => {
          const [px, py] = at(along);
          return onRoad(layout, px, py, SIDEWALK_WIDTH_M + 0.6, arm.index);
        });
        if (blocked) continue;
        const [x, y] = at(d + 4);
        items.hedges.push({ x, y, h: 0.5, sx: 8, sy: 1, sz: 1.3, rot });
      }
    }

    // Lampu jalan di trotoar sisi lajur masuk.
    for (let d = arm.stopDist + 20; d < arm.endDist; d += LAMP_SPACING_M) {
      const lateral = arm.halfWidth + 1.2;
      const x = arm.ox * d + arm.inLeftX * lateral;
      const y = arm.oy * d + arm.inLeftY * lateral;
      if (onRoad(layout, x, y, 0.4, arm.index)) continue;
      items.lampPoles.push({ x, y, h: 3.6, sx: 1, sy: 7.2, sz: 1 });
      // Kepala lampu menjorok ke arah jalan.
      items.lampHeads.push({
        x: x - arm.inLeftX * 0.9,
        y: y - arm.inLeftY * 0.9,
        h: 7.2,
        sx: 0.5,
        sy: 0.2,
        sz: 2,
        rot,
      });
    }
  }
  return items;
}

export function Scenery({
  layout,
  seed,
}: {
  layout: IntersectionLayout;
  seed: number;
}) {
  const items = useMemo(() => buildScenery(layout, seed), [layout, seed]);
  const half =
    Math.max(...layout.arms.map((arm) => arm.endDist)) + ROAD_OVERRUN_M;

  return (
    <group>
      {/* Hamparan rumput */}
      <mesh position={[0, -0.5, 0]}>
        <boxGeometry args={[half * 2, 1, half * 2]} />
        <meshLambertMaterial color={SCENE_COLORS.grass} />
      </mesh>

      <StaticInstances items={items.trunks}>
        <cylinderGeometry args={[0.28, 0.36, 1, 8]} />
        <meshLambertMaterial color={SCENE_COLORS.trunk} />
      </StaticInstances>
      <StaticInstances items={items.crowns}>
        <icosahedronGeometry args={[1, 1]} />
        <meshLambertMaterial color={SCENE_COLORS.foliage} flatShading />
      </StaticInstances>
      <StaticInstances items={items.hedges}>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial color={SCENE_COLORS.hedge} />
      </StaticInstances>
      <StaticInstances items={items.lampPoles}>
        <cylinderGeometry args={[0.12, 0.14, 1, 8]} />
        <meshLambertMaterial color={SCENE_COLORS.pole} />
      </StaticInstances>
      <StaticInstances items={items.lampHeads}>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial color={SCENE_COLORS.lampHead} />
      </StaticInstances>
    </group>
  );
}
