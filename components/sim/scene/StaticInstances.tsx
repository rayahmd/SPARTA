"use client";
import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Object3D } from "three";
import type { InstancedMesh } from "three";

/**
 * Satu benda statis di scene. Posisi memakai koordinat simulasi (x timur,
 * y utara) dan `h` = tinggi pusat benda. Skala memakai sumbu lokal benda
 * (sx = panjang, sy = tinggi, sz = lebar); `rot` memutar sumbu panjangnya
 * (radian, 0 = menghadap timur, berlawanan jarum jam).
 */
export interface InstanceTransform {
  x: number;
  y: number;
  h: number;
  sx: number;
  sy: number;
  sz: number;
  rot?: number;
}

const scratch = new Object3D();

/** Menggambar banyak benda statis yang sama dalam satu draw call. */
export function StaticInstances({
  items,
  children,
}: {
  items: InstanceTransform[];
  children: ReactNode;
}) {
  const ref = useRef<InstancedMesh | null>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((item, i) => {
      scratch.position.set(item.x, item.h, -item.y);
      scratch.rotation.set(0, item.rot ?? 0, 0);
      scratch.scale.set(item.sx, item.sy, item.sz);
      scratch.updateMatrix();
      mesh.setMatrixAt(i, scratch.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [items]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      key={items.length}
      ref={ref}
      args={[undefined, undefined, items.length]}
      frustumCulled={false}
    >
      {children}
    </instancedMesh>
  );
}
