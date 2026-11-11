"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { V3 } from "@/lib/journey";
import { world } from "@/lib/world";

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

type ToyMaterial = THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;
const toyCache = new Map<string, ToyMaterial>();

/**
 * Matte "painted wood" surface. `emit` makes it glow softly in its own colour.
 * Matte pieces use the cheaper Lambert shading; only shiny or metallic ones pay for the full model.
 */
export function toyMat(color: string, rough = 0.72, metal = 0, emit = 0): ToyMaterial {
  const key = `${color}|${rough}|${metal}|${emit}`;
  let m = toyCache.get(key);
  if (!m) {
    m = metal > 0 || rough < 0.4 ? new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }) : new THREE.MeshLambertMaterial({ color });
    if (emit) {
      m.emissive.set(color);
      m.emissiveIntensity = emit;
    }
    toyCache.set(key, m);
  }
  return m;
}

const glowCache = new Map<string, { mat: THREE.MeshBasicMaterial; base: THREE.Color; boost: number }>();
let bloomOn = true;

/**
 * Unlit, brighter-than-white surface that the bloom pass turns into a glow.
 * Without bloom (low quality) the boost is dropped so colours keep their hue.
 */
export function glowMat(color: string, boost = 2) {
  const key = `${color}|${boost}`;
  let g = glowCache.get(key);
  if (!g) {
    const base = new THREE.Color(color);
    g = { mat: new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(bloomOn ? boost : 1) }), base, boost };
    glowCache.set(key, g);
  }
  return g.mat;
}

export function setBloom(on: boolean) {
  bloomOn = on;
  for (const g of glowCache.values()) g.mat.color.copy(g.base).multiplyScalar(on ? g.boost : 1);
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}

export const geo = {
  box: (w: number, h: number, d: number, round = 0.05) =>
    cached(`box|${w}|${h}|${d}|${round}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.min(round, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001))),
  cyl: (top: number, bottom: number, h: number, seg = 24) => cached(`cyl|${top}|${bottom}|${h}|${seg}`, () => new THREE.CylinderGeometry(top, bottom, h, seg)),
  ball: (r: number, seg = 24) => cached(`ball|${r}|${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.66)))),
  cone: (r: number, h: number, seg = 24) => cached(`cone|${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  /** Four-sided roof, 1 × 1 at the base and 1 tall; scale it to size. */
  pyramid: () => cached("pyramid", () => new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4)),
  plane: () => cached("plane", () => new THREE.PlaneGeometry(1, 1)),
  torus: (r: number, tube: number, arc = Math.PI * 2) => cached(`torus|${r}|${tube}|${arc}`, () => new THREE.TorusGeometry(r, tube, 12, 48, arc)),
};

/* ------------------------------------------------------------------ */
/* Single pieces                                                       */
/* ------------------------------------------------------------------ */

type PieceProps = {
  /** Centre of the piece. */
  p?: V3;
  /** Rotation in radians. */
  r?: V3;
  /** Colour. */
  c?: string;
  /** Glow strength. When set, the piece is an unlit light source instead of painted wood. */
  glow?: number;
  rough?: number;
  metal?: number;
  /** Soft self-glow for a painted piece (lit-from-inside surfaces). */
  emit?: number;
  scale?: V3 | number;
  shadow?: boolean;
};

function Piece({ g, p, r, c = "#ffffff", glow, rough, metal, emit, scale, shadow = true }: PieceProps & { g: THREE.BufferGeometry }) {
  const m = glow ? glowMat(c, glow) : toyMat(c, rough, metal, emit);
  return <mesh geometry={g} material={m} position={p} rotation={r} scale={scale} castShadow={shadow && !glow} receiveShadow={!glow} />;
}

/** Rounded box. `s` is width, height, depth. */
export const Box = ({ s, round, ...rest }: PieceProps & { s: V3; round?: number }) => <Piece g={geo.box(s[0], s[1], s[2], round)} {...rest} />;
/** Cylinder. `s` is top radius, bottom radius, height. */
export const Cyl = ({ s, seg, ...rest }: PieceProps & { s: V3; seg?: number }) => <Piece g={geo.cyl(s[0], s[1], s[2], seg)} {...rest} />;
/** Sphere of radius `s`. */
export const Ball = ({ s, seg, ...rest }: PieceProps & { s: number; seg?: number }) => <Piece g={geo.ball(s, seg)} {...rest} />;
/** Cone. `s` is radius, height. */
export const Cone = ({ s, seg, ...rest }: PieceProps & { s: [number, number]; seg?: number }) => <Piece g={geo.cone(s[0], s[1], seg)} {...rest} />;
/** Four-sided roof. `s` is width, height, depth. */
export const Roof = ({ s, ...rest }: PieceProps & { s: V3 }) => <Piece g={geo.pyramid()} scale={s} {...rest} />;

/* ------------------------------------------------------------------ */
/* Instanced sets: many copies of one shape in a single draw call      */
/* ------------------------------------------------------------------ */

export type Item = { p: V3; s?: V3 | number; r?: V3; c?: string };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

function writeItems(mesh: THREE.InstancedMesh, items: Item[]) {
  items.forEach((it, i) => {
    _p.set(it.p[0], it.p[1], it.p[2]);
    _e.set(it.r?.[0] ?? 0, it.r?.[1] ?? 0, it.r?.[2] ?? 0);
    _q.setFromEuler(_e);
    if (typeof it.s === "number") _s.setScalar(it.s);
    else if (it.s) _s.set(it.s[0], it.s[1], it.s[2]);
    else _s.setScalar(1);
    mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    mesh.setColorAt(i, _c.set(it.c ?? "#ffffff"));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/** Each item's colour tints a white material, so one set can hold many colours. */
export function Inst({ g, items, glow, rough = 0.72, emit = 0, shadow = true, m }: { g: THREE.BufferGeometry; items: Item[]; glow?: number; rough?: number; emit?: number; shadow?: boolean; m?: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = m ?? (glow ? glowMat("#ffffff", glow) : toyMat("#ffffff", rough, 0, emit));
  useLayoutEffect(() => {
    if (ref.current) writeItems(ref.current, items);
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[g, mat, items.length]} castShadow={shadow && !glow} receiveShadow={!glow} />;
}

/* ------------------------------------------------------------------ */
/* Seeded randomness, so every visit builds the same scene              */
/* ------------------------------------------------------------------ */

export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(list: T[], r: number) => list[Math.floor(r * list.length) % list.length];

/* ------------------------------------------------------------------ */
/* Plinth                                                              */
/* ------------------------------------------------------------------ */

/**
 * The base every venue model stands on: a dark stone disc with a planted top and a thin
 * line of light in the day's colour. Its top is y = 0 for the model.
 */
export function Plinth({ r = 17, color, top = "#17382c" }: { r?: number; color: string; top?: string }) {
  const rim = useMemo(() => new THREE.TorusGeometry(r + 0.02, 0.055, 8, 120).rotateX(Math.PI / 2), [r]);
  return (
    <group>
      <mesh geometry={geo.cyl(r, r + 0.45, 0.5, 80)} material={toyMat("#151720")} position={[0, -0.25, 0]} receiveShadow />
      <mesh geometry={geo.cyl(r - 0.9, r - 0.9, 0.06, 80)} material={toyMat(top)} position={[0, 0.03, 0]} receiveShadow />
      <mesh geometry={rim} material={glowMat(color, 1.9)} position={[0, 0.03, 0]} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Light pools: cheap "lamp light on the ground"                        */
/* ------------------------------------------------------------------ */

let radial: THREE.CanvasTexture | null = null;
export function radialTexture() {
  if (radial) return radial;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.42)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  radial = new THREE.CanvasTexture(c);
  return radial;
}

let poolMaterial: THREE.MeshBasicMaterial | null = null;
const poolGeometry = () => cached("pool", () => new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2));

export type Pool = { p: V3; r: number; c: string; o?: number };

/** Soft discs of coloured light lying on the ground. */
export function Pools({ items }: { items: Pool[] }) {
  poolMaterial ??= new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const list = useMemo<Item[]>(
    () =>
      items.map((it) => {
        const c = new THREE.Color(it.c).multiplyScalar(it.o ?? 0.55);
        return { p: [it.p[0], it.p[1] + 0.04, it.p[2]], s: [it.r, 1, it.r], c: `#${c.getHexString()}` };
      }),
    [items],
  );
  return <Inst g={poolGeometry()} items={list} m={poolMaterial} shadow={false} />;
}

/* ------------------------------------------------------------------ */
/* Lamps, string lights, trees, palms                                  */
/* ------------------------------------------------------------------ */

export type Lamp = { p: V3; h?: number; c?: string; r?: number };

export function Lamps({ items }: { items: Lamp[] }) {
  const { poles, bulbs, pools } = useMemo(() => {
    const poles: Item[] = [];
    const bulbs: Item[] = [];
    const pools: Pool[] = [];
    for (const l of items) {
      const h = l.h ?? 3.4;
      const c = l.c ?? "#ffd2a0";
      poles.push({ p: [l.p[0], l.p[1] + h / 2, l.p[2]], s: [1, h, 1], c: "#14161f" });
      bulbs.push({ p: [l.p[0], l.p[1] + h + 0.2, l.p[2]], s: 1, c });
      pools.push({ p: l.p, r: l.r ?? 4.6, c });
    }
    return { poles, bulbs, pools };
  }, [items]);
  return (
    <>
      <Inst g={geo.cyl(0.07, 0.1, 1, 10)} items={poles} />
      <Inst g={geo.ball(0.2, 16)} items={bulbs} glow={2.6} />
      <Pools items={pools} />
    </>
  );
}

const WARM = ["#ffe2b8", "#ffd29a", "#fff0d8"];

/** Bulbs hanging on sagging wires between pairs of points. */
export function Strings({ strands, colors = WARM, sag = 1.1, gap = 0.85, size = 0.085 }: { strands: [V3, V3][]; colors?: string[]; sag?: number; gap?: number; size?: number }) {
  const { bulbs, wire } = useMemo(() => {
    const bulbs: Item[] = [];
    const pts: number[] = [];
    let n = 0;
    for (const [a, b] of strands) {
      const va = new THREE.Vector3(...a);
      const vb = new THREE.Vector3(...b);
      const count = Math.max(3, Math.round(va.distanceTo(vb) / gap));
      let prev: THREE.Vector3 | null = null;
      for (let k = 0; k <= count; k++) {
        const t = k / count;
        const v = va.clone().lerp(vb, t);
        v.y -= sag * 4 * t * (1 - t);
        if (prev) pts.push(prev.x, prev.y, prev.z, v.x, v.y, v.z);
        prev = v;
        if (k > 0 && k < count) bulbs.push({ p: [v.x, v.y - size, v.z], c: colors[n++ % colors.length] });
      }
    }
    const wire = new THREE.BufferGeometry();
    wire.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return { bulbs, wire };
  }, [strands, colors, sag, gap, size]);
  const line = useMemo(() => new THREE.LineBasicMaterial({ color: "#1c1838" }), []);
  return (
    <>
      <lineSegments geometry={wire} material={line} />
      <Inst g={geo.ball(size, 10)} items={bulbs} glow={2.8} />
    </>
  );
}

const GREENS = ["#1f4d3c", "#245844", "#1b4435", "#2a614b"];

/** Round toy trees: a trunk and two soft balls of leaves. */
export function Trees({ items, seed = 5 }: { items: { p: V3; s?: number }[]; seed?: number }) {
  const { trunks, crowns } = useMemo(() => {
    const rand = seeded(seed);
    const trunks: Item[] = [];
    const crowns: Item[] = [];
    for (const t of items) {
      const s = t.s ?? 1;
      const [x, y, z] = t.p;
      trunks.push({ p: [x, y + 0.9 * s, z], s: [s, 1.8 * s, s], c: "#3a2e28" });
      const c = pick(GREENS, rand());
      crowns.push({ p: [x, y + 2.6 * s, z], s: 1.35 * s, c });
      crowns.push({ p: [x + 0.55 * s, y + 3.5 * s, z + 0.25 * s], s: 0.9 * s, c: pick(GREENS, rand()) });
      crowns.push({ p: [x - 0.6 * s, y + 3.2 * s, z - 0.3 * s], s: 0.8 * s, c });
    }
    return { trunks, crowns };
  }, [items, seed]);
  return (
    <>
      <Inst g={geo.cyl(0.2, 0.3, 1, 10)} items={trunks} />
      <Inst g={geo.ball(1, 18)} items={crowns} rough={0.9} />
    </>
  );
}

/** Palms: a leaning trunk with a fan of drooping leaves. */
export function Palms({ items, seed = 9 }: { items: { p: V3; s?: number; lean?: number }[]; seed?: number }) {
  const { trunks, leaves, nuts } = useMemo(() => {
    const rand = seeded(seed);
    const trunks: Item[] = [];
    const leaves: Item[] = [];
    const nuts: Item[] = [];
    for (const t of items) {
      const s = t.s ?? 1;
      const h = 5.2 * s;
      const lean = t.lean ?? (rand() - 0.5) * 0.3;
      const [x, y, z] = t.p;
      const topX = x + Math.sin(lean) * h;
      const topY = y + Math.cos(lean) * h;
      trunks.push({ p: [(x + topX) / 2, (y + topY) / 2, z], s: [s, h, s], r: [0, 0, -lean], c: "#4a3a30" });
      const turn = rand() * Math.PI;
      for (let k = 0; k < 7; k++) {
        const a = turn + (k / 7) * Math.PI * 2;
        const reach = 1.45 * s;
        leaves.push({
          p: [topX + Math.cos(a) * reach, topY - 0.28 * s, z + Math.sin(a) * reach],
          s: [1.75 * s, 0.1 * s, 0.5 * s],
          r: [0, -a, -0.42],
          c: k % 2 ? "#1f4d3c" : "#2a614b",
        });
      }
      nuts.push({ p: [topX + 0.2 * s, topY - 0.25 * s, z + 0.15 * s], s: 0.24 * s, c: "#5a3b2e" }, { p: [topX - 0.18 * s, topY - 0.3 * s, z - 0.1 * s], s: 0.22 * s, c: "#5a3b2e" });
    }
    return { trunks, leaves, nuts };
  }, [items, seed]);
  return (
    <>
      <Inst g={geo.cyl(0.16, 0.27, 1, 10)} items={trunks} />
      <Inst g={geo.ball(1, 16)} items={leaves} rough={0.85} />
      <Inst g={geo.ball(1, 10)} items={nuts} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Glowing signs                                                       */
/* ------------------------------------------------------------------ */

/** Lettering drawn to a texture and shown as a glowing plane, `w` wide and `h` tall. */
export function Sign({ text, p, r, w, h, c = "#ffe2b0", glow = 2.4, weight = 600 }: { text: string; p: V3; r?: V3; w: number; h: number; c?: string; glow?: number; weight?: number }) {
  const [map, setMap] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    let live = true;
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim() || "system-ui, sans-serif";
    const draw = () => {
      if (!live) return;
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = Math.max(64, Math.round((1024 * h) / w));
      const ctx = canvas.getContext("2d")!;
      let px = canvas.height * 0.78;
      ctx.font = `${weight} ${px}px ${family}`;
      const wide = ctx.measureText(text).width;
      if (wide > canvas.width * 0.96) px *= (canvas.width * 0.96) / wide;
      ctx.font = `${weight} ${px}px ${family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + px * 0.04);
      const t = new THREE.CanvasTexture(canvas);
      t.anisotropy = 4;
      setMap((old) => {
        old?.dispose();
        return t;
      });
    };
    document.fonts.load(`${weight} 64px ${family}`).then(draw, draw);
    return () => {
      live = false;
    };
  }, [text, w, h, weight]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), []);
  useEffect(() => {
    mat.map = map;
    mat.color.copy(glowMat(c, glow).color);
    mat.needsUpdate = true;
  }, [mat, map, c, glow]);
  if (!map) return null;
  return <mesh geometry={geo.plane()} material={mat} position={p} rotation={r} scale={[w, h, 1]} />;
}

/* ------------------------------------------------------------------ */
/* Light beams                                                         */
/* ------------------------------------------------------------------ */

const beamGeometry = () => cached("beam", () => new THREE.ConeGeometry(1, 1, 28, 1, true).translate(0, -0.5, 0));
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * A soft cone of light from `p` toward `to`. `spread` is its radius at the far end.
 * `sweep` swings it side to side; the beam brightens as its island comes into focus.
 */
export function Beam({ p, to, spread = 2.4, c = "#ffe2b0", power = 0.3, island, sweep = 0, speed = 0.6, phase = 0 }: { p: V3; to: V3; spread?: number; c?: string; power?: number; island: number; sweep?: number; speed?: number; phase?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(c) }, uPower: { value: power } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uPower;
          varying vec2 vUv;
          void main() {
            // Brightest at the lamp, fading to nothing at the far end.
            float a = pow(vUv.y, 1.7) * uPower;
            gl_FragColor = vec4(uColor * a, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [c, power],
  );
  const { length, base } = useMemo(() => {
    const dir = new THREE.Vector3(to[0] - p[0], to[1] - p[1], to[2] - p[2]);
    const length = dir.length();
    return { length, base: new THREE.Quaternion().setFromUnitVectors(DOWN, dir.normalize()) };
  }, [p, to]);
  const swing = useMemo(() => new THREE.Quaternion(), []);
  const axis = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const f = world.focus[island];
    mesh.visible = f > 0.02;
    if (!mesh.visible) return;
    mat.uniforms.uPower.value = power * f;
    mesh.quaternion.copy(base);
    if (sweep && !world.reduced) mesh.quaternion.multiply(swing.setFromAxisAngle(axis, Math.sin(clock.elapsedTime * speed + phase) * sweep));
  });
  return <mesh ref={ref} geometry={beamGeometry()} material={mat} position={p} scale={[spread, length, spread]} />;
}

/* ------------------------------------------------------------------ */
/* Scale figures                                                       */
/* ------------------------------------------------------------------ */

export type Figure = { p: V3; /** Which way they face, radians. 0 faces the street (+Z). */ face?: number; h?: number };

const figureBody = () =>
  cached("figure-body", () => new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.22, 0.05], [0.19, 0.72], [0.24, 1.06], [0.2, 1.38], [0.07, 1.5], [0, 1.5]].map(([x, y]) => new THREE.Vector2(x, y)), 14));
const figureHead = () => cached("figure-head", () => new THREE.SphereGeometry(0.135, 14, 10).translate(0, 1.65, 0));

/** Plain, pale scale figures, as on an architect's model: they show size and where people gather. */
export function Figures({ items, color = "#e9e5dc" }: { items: Figure[]; color?: string }) {
  const list = useMemo<Item[]>(() => items.map((f) => ({ p: f.p, r: [0, f.face ?? 0, 0] as V3, s: f.h ?? 1 })), [items]);
  const mat = toyMat(color);
  return (
    <>
      <Inst g={figureBody()} items={list} m={mat} />
      <Inst g={figureHead()} items={list} m={mat} />
    </>
  );
}

/** Face from one ground point toward another. */
export const faceTo = (from: V3, to: V3) => Math.atan2(to[0] - from[0], to[2] - from[2]);
