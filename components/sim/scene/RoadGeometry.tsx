"use client";
import { useEffect, useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { STOP_SETBACK_M } from "@/lib/sim/layout";
import type { ArmLayout, IntersectionLayout } from "@/lib/sim/layout";
import { SCENE_COLORS } from "../simTheme";
import { StaticInstances } from "./StaticInstances";
import type { InstanceTransform } from "./StaticInstances";

// Koordinat simulasi (x timur, y utara) → three.js (x, tinggi, -y).
// Lengan simpang bisa berarah bebas, jadi tiap benda diputar mengikuti lengannya.

/** Jalan digambar sedikit melewati titik muncul kendaraan. */
export const ROAD_OVERRUN_M = 18;
export const SIDEWALK_WIDTH_M = 2.6;
const SIDEWALK_HEIGHT_M = 0.18;
const DASH_M = 4;
const DASH_GAP_M = 6;
const LINE_WIDTH_M = 0.22;

/** Sudut putar (sumbu Y three.js) supaya sumbu panjang benda searah lengan. */
export function armRotation(arm: ArmLayout): number {
  return Math.atan2(arm.oy, arm.ox);
}

/** Persegi panjang sejajar lengan: `along` searah lengan, `across` melintang. */
export function armRect(
  arm: ArmLayout,
  dist: number,
  lateral: number,
  lx: number,
  ly: number,
  along: number,
  across: number,
  h: number,
  thickness: number,
): InstanceTransform {
  return {
    x: arm.ox * dist + lx * lateral,
    y: arm.oy * dist + ly * lateral,
    h,
    sx: along,
    sy: thickness,
    sz: across,
    rot: armRotation(arm),
  };
}

function buildMarkings(layout: IntersectionLayout): InstanceTransform[] {
  const items: InstanceTransform[] = [];
  const w = layout.laneWidth;
  for (const arm of layout.arms) {
    // Garis tengah (as jalan), utuh dari garis henti sampai ujung lengan.
    const centerLen = arm.endDist - arm.stopDist;
    items.push(
      armRect(arm, arm.stopDist + centerLen / 2, 0, 0, 0, centerLen, LINE_WIDTH_M * 1.6, 0.06, 0.02),
    );

    // Pembatas lajur putus-putus, sisi masuk dan sisi keluar.
    const sides: [number, number][] = [
      [arm.inLeftX, arm.inLeftY],
      [arm.outLeftX, arm.outLeftY],
    ];
    for (let k = 1; k < arm.lanes; k++) {
      for (const [lx, ly] of sides) {
        for (
          let d = arm.stopDist + 3;
          d + DASH_M <= arm.endDist;
          d += DASH_M + DASH_GAP_M
        ) {
          items.push(
            armRect(arm, d + DASH_M / 2, k * w, lx, ly, DASH_M, LINE_WIDTH_M, 0.06, 0.02),
          );
        }
      }
    }

    // Zebra cross di antara sudut simpang dan garis henti.
    const zebraDist = arm.stopDist - STOP_SETBACK_M / 2 - 0.35;
    for (let lateral = -arm.halfWidth + 0.6; lateral < arm.halfWidth; lateral += 1.15) {
      items.push(
        armRect(arm, zebraDist, lateral, arm.inLeftX, arm.inLeftY, 2.5, 0.5, 0.06, 0.02),
      );
    }
  }
  return items;
}

function buildSidewalks(layout: IntersectionLayout): InstanceTransform[] {
  const items: InstanceTransform[] = [];
  for (const arm of layout.arms) {
    const end = arm.endDist + ROAD_OVERRUN_M;
    // Tiap sisi mulai dari sudut simpang di sisi itu. Bila tidak ada lengan di
    // sisi itu (mis. sisi seberang kaki pertigaan), trotoar menerus sampai pusat.
    const sides: [number, number, number][] = [
      [arm.inLeftX, arm.inLeftY, arm.cornerIn],
      [arm.outLeftX, arm.outLeftY, arm.cornerOut],
    ];
    for (const [lx, ly, start] of sides) {
      items.push(
        armRect(
          arm,
          (start + end) / 2,
          arm.halfWidth + SIDEWALK_WIDTH_M / 2,
          lx,
          ly,
          end - start,
          SIDEWALK_WIDTH_M,
          SIDEWALK_HEIGHT_M / 2,
          SIDEWALK_HEIGHT_M,
        ),
      );
    }
  }
  return items;
}

function makeLabelTexture(text: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(3, 3, 314, 66, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#111827";
    ctx.font = `700 34px ${getComputedStyle(document.body).fontFamily || "sans-serif"}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 160, 38, 296);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function RoadGeometry({ layout }: { layout: IntersectionLayout }) {
  const markings = useMemo(() => buildMarkings(layout), [layout]);
  const sidewalks = useMemo(() => buildSidewalks(layout), [layout]);

  const labels = useMemo(
    () =>
      layout.arms.map((arm) => ({
        id: arm.id,
        texture: makeLabelTexture(arm.label),
        // Di rumput sisi lajur keluar, supaya tidak menutupi antrean di lajur masuk.
        x:
          arm.ox * (arm.stopDist + 24) +
          arm.outLeftX * (arm.halfWidth + SIDEWALK_WIDTH_M + 5),
        y:
          arm.oy * (arm.stopDist + 24) +
          arm.outLeftY * (arm.halfWidth + SIDEWALK_WIDTH_M + 5),
      })),
    [layout],
  );
  useEffect(() => {
    return () => {
      for (const label of labels) label.texture.dispose();
    };
  }, [labels]);

  return (
    <group>
      {/* Badan jalan: satu persegi panjang per lengan, bertemu di pusat simpang */}
      {layout.arms.map((arm) => {
        const length = arm.endDist + ROAD_OVERRUN_M;
        return (
          <mesh
            key={arm.id}
            position={[(arm.ox * length) / 2, 0.02, (-arm.oy * length) / 2]}
            rotation={[0, armRotation(arm), 0]}
          >
            <boxGeometry args={[length, 0.04, arm.halfWidth * 2]} />
            <meshBasicMaterial color={SCENE_COLORS.asphalt} />
          </mesh>
        );
      })}

      <StaticInstances items={sidewalks}>
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial color={SCENE_COLORS.sidewalk} />
      </StaticInstances>

      {/* Marka: garis tengah, pembatas lajur, zebra cross */}
      <StaticInstances items={markings}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={SCENE_COLORS.marking} />
      </StaticInstances>

      {/* Nama pendekat */}
      {labels.map((label) => (
        <sprite
          key={label.id}
          position={[label.x, 6, -label.y]}
          scale={[14.4, 3.25, 1]}
        >
          <spriteMaterial map={label.texture} depthTest={false} />
        </sprite>
      ))}
    </group>
  );
}
