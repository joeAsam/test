"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { V3 } from "@/lib/journey";
import { seeded, toyMat } from "./kit";

/**
 * People at the venues: small stylised characters with real proportions — head, hair or
 * headwrap, arms, legs and an outfit — dressed for the occasion. Every part of every
 * person at a venue is drawn in one call per part shape, so a crowd stays cheap.
 */

export type Figure = {
  p: V3;
  /** Which way they face, radians. 0 faces the street (+Z). */
  face?: number;
  /** Height scale; 1 is about 1.75 m. */
  h?: number;
  /** Seated: on a chair, lounger or bench of seat height about 0.45 m. */
  sit?: boolean;
};

/** What people wear: an everyday crowd, a party night, or a formal dinner. */
export type Wardrobe = "smart" | "party" | "formal";

const SKIN = ["#8d5a3b", "#6f4329", "#a56c46", "#5b3622", "#7c4d31", "#9a6240", "#4e2e1d"];
const HAIR = ["#17110f", "#1f1612", "#2a1d17", "#120e0c"];
const SHOES = ["#1a1716", "#2b2320", "#3b2a22", "#f1ece4"];

/** Bold prints and plains, as in a Lagos crowd: ankara oranges and teals, deep blues, wine, white lace. */
const PRINTS = ["#e0662f", "#d9a12b", "#1f8a7a", "#2f5fb0", "#b7334d", "#7a3fa0", "#2c9a5a", "#e7c46b", "#c4572e", "#1d6f8f"];
const PLAINS = ["#f2ede4", "#20242e", "#2f3c56", "#e9e2d2", "#5a2f3a", "#36513f", "#d9cfbf", "#273a5c"];
const DARK = ["#16181f", "#22252f", "#1b2433", "#2a1f24"];

type Look = {
  skin: string;
  hair: string;
  hairStyle: "short" | "afro" | "bun" | "braids" | "low";
  head?: { kind: "gele" | "fila"; color: string };
  top: string;
  lower: string;
  shoes: string;
  /** dress: skirt to below the knee. robe: a full-length agbada or kaftan over trousers. */
  cut: "trousers" | "dress" | "robe";
  sleeves: "long" | "short" | "wide";
};

const pick = <T,>(list: T[], r: number) => list[Math.floor(r * list.length) % list.length];

function dress(wardrobe: Wardrobe, rand: () => number): Look {
  const woman = rand() < 0.52;
  const skin = pick(SKIN, rand());
  const hair = pick(HAIR, rand());
  const shoes = pick(SHOES, rand() * 0.75);
  if (wardrobe === "formal") {
    if (woman) {
      const c = pick(PRINTS, rand());
      return { skin, hair, hairStyle: pick(["bun", "low", "braids"] as const, rand()), head: rand() < 0.55 ? { kind: "gele", color: rand() < 0.5 ? c : "#e7c46b" } : undefined, top: c, lower: c, shoes, cut: "dress", sleeves: rand() < 0.5 ? "short" : "long" };
    }
    const robe = rand() < 0.5;
    const c = robe ? pick(["#f2ede4", "#e9e2d2", "#2f3c56", "#5a2f3a", "#1d6f8f"], rand()) : pick(DARK, rand());
    return { skin, hair, hairStyle: pick(["short", "low"] as const, rand()), head: robe && rand() < 0.7 ? { kind: "fila", color: pick(["#5a2f3a", "#2f3c56", "#e7c46b", "#20242e"], rand()) } : undefined, top: c, lower: robe ? c : pick(DARK, rand()), shoes: pick(SHOES, rand() * 0.75), cut: robe ? "robe" : "trousers", sleeves: robe ? "wide" : "long" };
  }
  if (wardrobe === "party") {
    if (woman) {
      const dressUp = rand() < 0.5;
      return { skin, hair, hairStyle: pick(["afro", "braids", "bun", "low"] as const, rand()), top: pick(PRINTS, rand()), lower: dressUp ? pick(PRINTS, rand()) : pick(PLAINS, rand()), shoes, cut: dressUp ? "dress" : "trousers", sleeves: "short" };
    }
    return { skin, hair, hairStyle: pick(["short", "afro", "low"] as const, rand()), top: rand() < 0.6 ? pick(PRINTS, rand()) : pick(PLAINS, rand()), lower: pick(DARK.concat(["#2f3c56", "#e9e2d2"]), rand()), shoes, cut: "trousers", sleeves: "short" };
  }
  // Smart: the leadership session, the cinema, the excursion.
  if (woman) {
    const inPrint = rand() < 0.55;
    const cut = rand() < 0.5 ? "dress" : "trousers";
    return { skin, hair, hairStyle: pick(["bun", "braids", "afro", "low"] as const, rand()), head: inPrint && rand() < 0.25 ? { kind: "gele", color: pick(PRINTS, rand()) } : undefined, top: inPrint ? pick(PRINTS, rand()) : pick(PLAINS, rand()), lower: cut === "dress" ? pick(PRINTS, rand()) : pick(DARK.concat(PLAINS), rand()), shoes, cut, sleeves: rand() < 0.5 ? "short" : "long" };
  }
  const robe = rand() < 0.22;
  const c = pick(robe ? PRINTS.concat(PLAINS) : PLAINS.concat(PRINTS), rand());
  return { skin, hair, hairStyle: pick(["short", "low", "afro"] as const, rand()), head: robe && rand() < 0.5 ? { kind: "fila", color: pick(PRINTS, rand()) } : undefined, top: c, lower: robe ? c : pick(DARK.concat(["#2f3c56", "#d9cfbf"]), rand()), shoes, cut: robe ? "robe" : "trousers", sleeves: robe ? "wide" : rand() < 0.5 ? "short" : "long" };
}

/* ------------------------------------------------------------------ */
/* Part shapes, built once                                             */
/* ------------------------------------------------------------------ */

const lathe = (pts: [number, number][], seg = 16) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

let shapes: Record<string, THREE.BufferGeometry> | null = null;
function partShapes() {
  if (shapes) return shapes;
  shapes = {
    // A rounded limb 1 unit long, hanging down from its top (y = 0 → -1).
    limb: new THREE.CapsuleGeometry(0.5, 1, 4, 10).translate(0, -1, 0).scale(1, 1 / 2, 1),
    torso: lathe([[0, 0], [0.155, 0], [0.165, 0.08], [0.175, 0.3], [0.2, 0.44], [0.17, 0.5], [0.07, 0.54], [0, 0.54]], 16),
    skirt: lathe([[0, 0], [0.255, 0], [0.2, 0.3], [0.15, 0.5], [0, 0.5]], 18),
    robe: lathe([[0, 0], [0.33, 0], [0.3, 0.5], [0.26, 0.9], [0.19, 1.02], [0, 1.02]], 18),
    sleeve: lathe([[0, -0.44], [0.15, -0.44], [0.13, -0.38], [0.045, 0], [0, 0]], 12),
    head: new THREE.SphereGeometry(0.105, 16, 12).scale(1, 1.12, 1.04),
    neck: new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10),
    hand: new THREE.SphereGeometry(0.042, 10, 8),
    shoe: new THREE.SphereGeometry(0.06, 10, 6).scale(0.85, 0.55, 1.6),
    hairShort: new THREE.SphereGeometry(0.112, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 1.1, 1.06),
    hairAfro: new THREE.SphereGeometry(0.15, 16, 12).scale(1, 0.95, 1),
    bun: new THREE.SphereGeometry(0.065, 12, 10),
    braids: new THREE.CylinderGeometry(0.085, 0.06, 0.22, 12),
    gele: new THREE.SphereGeometry(0.13, 14, 10).scale(1.45, 0.85, 1.2),
    geleFan: new THREE.ConeGeometry(0.16, 0.16, 12, 1, true),
    fila: new THREE.CylinderGeometry(0.11, 0.115, 0.1, 14),
  };
  return shapes;
}

/* ------------------------------------------------------------------ */
/* Assembling a person                                                  */
/* ------------------------------------------------------------------ */

type Part = { shape: string; m: THREE.Matrix4; color: string };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

const local = (pos: V3, rot: V3 = [0, 0, 0], scale: V3 | number = 1) => {
  _p.set(pos[0], pos[1], pos[2]);
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  if (typeof scale === "number") _s.setScalar(scale);
  else _s.set(scale[0], scale[1], scale[2]);
  return new THREE.Matrix4().compose(_p, _q, _s);
};

function personParts(f: Figure, look: Look, rand: () => number): Part[] {
  const parts: Part[] = [];
  const add = (shape: string, color: string, m: THREE.Matrix4) => parts.push({ shape, color, m });
  const sit = !!f.sit;
  // Standing, the hips are 0.88 m up; seated, they rest on the seat.
  const hip = sit ? 0.47 : 0.88;
  const legColor = look.cut === "dress" && !sit ? look.skin : look.lower;
  const legW = 0.135;

  if (sit) {
    for (const x of [-0.09, 0.09]) {
      add("limb", look.lower, local([x, hip, 0.02], [-Math.PI / 2, 0, 0], [legW + 0.01, 0.44, legW + 0.01]));
      add("limb", legColor === look.lower ? look.lower : look.skin, local([x, hip, 0.44], [0, 0, 0], [legW, 0.43, legW]));
      add("shoe", look.shoes, local([x, 0.035, 0.49]));
    }
  } else if (look.cut !== "robe") {
    for (const x of [-0.09, 0.09]) {
      // A slight stance: feet a little apart, one a little forward.
      const step = (rand() - 0.5) * 0.1;
      add("limb", legColor, local([x, hip, step * 0.3], [step * 0.3, 0, x * 0.25], [legW, hip - 0.05, legW]));
      add("shoe", look.shoes, local([x * 1.1, 0.035, step + 0.04]));
    }
  } else {
    for (const x of [-0.085, 0.085]) add("shoe", look.shoes, local([x, 0.035, 0.08]));
  }

  // Skirt or full-length robe.
  if (look.cut === "dress" && !sit) add("skirt", look.lower, local([0, hip - 0.42, 0]));
  if (look.cut === "dress" && sit) add("skirt", look.lower, local([0, hip - 0.06, 0.16], [-1.15, 0, 0], [1, 0.75, 1]));
  if (look.cut === "robe" && !sit) add("robe", look.top, local([0, 0.04, 0]));

  // Torso, neck, head.
  const chest = hip - 0.02;
  add("torso", look.top, local([0, chest, 0], [0, 0, 0], [1.12, 1, 0.86]));
  add("neck", look.skin, local([0, chest + 0.58, 0]));
  const headY = chest + 0.72;
  add("head", look.skin, local([0, headY, 0.01]));

  // Hair and headwear.
  if (look.head?.kind === "gele") {
    add("gele", look.head.color, local([0, headY + 0.1, -0.02], [-0.25, 0, 0]));
    add("geleFan", look.head.color, local([0, headY + 0.16, -0.08], [-0.9, 0, 0], [1.2, 0.8, 1]));
  } else {
    if (look.hairStyle === "afro") add("hairAfro", look.hair, local([0, headY + 0.05, -0.02]));
    else if (look.hairStyle !== "low") add("hairShort", look.hair, local([0, headY + 0.005, -0.004]));
    else add("hairShort", look.hair, local([0, headY + 0.012, -0.002], [0, 0, 0], [0.98, 0.9, 0.98]));
    if (look.hairStyle === "bun") add("bun", look.hair, local([0, headY + 0.13, -0.08]));
    if (look.hairStyle === "braids") add("braids", look.hair, local([0, headY - 0.06, -0.09], [0.2, 0, 0]));
    if (look.head?.kind === "fila") add("fila", look.head.color, local([0, headY + 0.1, -0.005], [-0.12, 0, 0.08]));
  }

  // Arms, relaxed at the sides; seated, the hands rest in the lap.
  for (const side of [-1, 1]) {
    const shoulder: V3 = [side * 0.225, chest + 0.47, 0];
    const swing = sit ? -0.55 : (rand() - 0.5) * 0.2;
    const out = side * (look.sleeves === "wide" ? 0.16 : 0.09);
    const armLen = 0.58;
    const sleeveColor = look.sleeves === "short" ? look.skin : look.top;
    if (look.sleeves === "wide") add("sleeve", look.top, local(shoulder, [swing, 0, out], [1.2, 1, 1]));
    add("limb", sleeveColor, local(shoulder, [swing, 0, out], [0.1, armLen, 0.1]));
    if (look.sleeves === "short") add("limb", look.top, local(shoulder, [swing, 0, out], [0.125, 0.2, 0.125]));
    // The hand sits at the end of the arm.
    _m.copy(local(shoulder, [swing, 0, out]));
    const hand = new THREE.Vector3(0, -armLen - 0.03, 0).applyMatrix4(_m);
    add("hand", look.skin, local([hand.x, hand.y, hand.z]));
  }
  return parts;
}

/* ------------------------------------------------------------------ */

const _c = new THREE.Color();

/** A crowd of people at one venue. */
export function Figures({ items, wardrobe = "smart", seed = 3 }: { items: Figure[]; wardrobe?: Wardrobe; seed?: number }) {
  const groups = useMemo(() => {
    const rand = seeded(seed * 97 + items.length);
    const byShape = new Map<string, { m: THREE.Matrix4; color: string }[]>();
    for (const f of items) {
      const look = dress(wardrobe, rand);
      const placed = new THREE.Matrix4().compose(_p.set(f.p[0], f.p[1], f.p[2]), _q.setFromEuler(_e.set(0, f.face ?? 0, 0)), _s.setScalar(f.h ?? 1));
      for (const part of personParts(f, look, rand)) {
        const list = byShape.get(part.shape) ?? [];
        list.push({ m: new THREE.Matrix4().multiplyMatrices(placed, part.m), color: part.color });
        byShape.set(part.shape, list);
      }
    }
    return [...byShape.entries()];
  }, [items, wardrobe, seed]);

  return (
    <>
      {groups.map(([shape, list]) => (
        <PartSet key={shape} shape={shape} list={list} />
      ))}
    </>
  );
}

function PartSet({ shape, list }: { shape: string; list: { m: THREE.Matrix4; color: string }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = partShapes()[shape];
  // Cloth and skin are matte; a single shared white material, tinted per part.
  const material = toyMat("#ffffff", 0.85);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    list.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      mesh.setColorAt(i, _c.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list]);
  const small = shape === "hand" || shape === "bun" || shape === "neck";
  return <instancedMesh ref={ref} args={[geometry, material, list.length]} castShadow={!small} receiveShadow />;
}
