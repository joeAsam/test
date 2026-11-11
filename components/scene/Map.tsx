"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { loadCity, type CityData, type Road } from "@/lib/city";
import { MOON_DIR, SITES, TOWN, siteCenter } from "@/lib/journey";
import { IKOT_OFFSET } from "@/lib/venues";
import { world } from "@/lib/world";
import { seeded } from "./kit";

export const FOG_COLOR = "#080b20";
export const FOG_DENSITY = 0.000085;

/** Uniforms shared by every map layer, updated once a frame. */
const U = {
  uReach: { value: 0 },
  uTime: { value: 0 },
  uPx: { value: 1 },
  uFogColor: { value: new THREE.Color(FOG_COLOR) },
  uFogDensity: { value: FOG_DENSITY },
  uMoon: { value: MOON_DIR.clone() },
};

const COMMON = /* glsl */ `
  uniform float uReach;
  uniform float uTime;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform vec3 uMoon;
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  vec3 fogged(vec3 c, float d) { return mix(uFogColor, c, exp(-uFogDensity * uFogDensity * d * d)); }
  // The light spreads outward from DE Exchange (the map's origin). 1 where it has arrived.
  float litAt(vec2 xz) { return 1.0 - smoothstep(uReach - 90.0, uReach, length(xz)); }
  // The bright leading edge of that spread.
  float frontAt(vec2 xz) { float f = (length(xz) - uReach) / 60.0; return exp(-f * f) * step(1.0, uReach); }
`;

const FINISH = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

const WORLD_VERTEX = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

/* ------------------------------------------------------------------ */
/* Ground                                                              */
/* ------------------------------------------------------------------ */

function Ground() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: U,
        vertexShader: WORLD_VERTEX,
        fragmentShader:
          COMMON +
          /* glsl */ `
          varying vec3 vW;
          void main() {
            float d = length(vW - cameraPosition);
            float n = noise(vW.xz * 0.0035) * 0.6 + noise(vW.xz * 0.018) * 0.4;
            vec3 c = mix(vec3(0.007, 0.010, 0.026), vec3(0.016, 0.022, 0.05), n);
            // Lit streets throw a faint warm haze over the town.
            float town = exp(-pow(length(vW.xz - vec2(${TOWN[0].toFixed(1)}, ${TOWN[2].toFixed(1)})) / 2500.0, 2.0)) * litAt(vW.xz);
            c += vec3(0.034, 0.018, 0.008) * town;
            gl_FragColor = vec4(fogged(c, d), 1.0);
            ${FINISH}
          }`,
      }),
    [],
  );
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.1} material={mat} frustumCulled={false}>
      <circleGeometry args={[30000, 72]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Roads                                                               */
/* ------------------------------------------------------------------ */

const WIDTHS = [5, 8, 12, 17];

/** One ribbon for every road. Each side is pushed out in the vertex shader, so thin roads stay visible from the air. */
function roadGeometry(roads: Road[]) {
  const pos: number[] = [];
  const rank: number[] = [];
  const side: number[] = [];
  const along: number[] = [];
  const nrm: number[] = [];
  const hws: number[] = [];
  const idx: number[] = [];
  let v = 0;
  for (const road of roads) {
    const p = road.p;
    const n = p.length / 2;
    if (n < 2) continue;
    const hw = WIDTHS[road.r] / 2;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const x = p[2 * i];
      const z = p[2 * i + 1];
      if (i > 0) acc += Math.hypot(x - p[2 * i - 2], z - p[2 * i - 1]);
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      let tx = p[2 * b] - p[2 * a];
      let tz = p[2 * b + 1] - p[2 * a + 1];
      const l = Math.hypot(tx, tz) || 1;
      tx /= l;
      tz /= l;
      const y = 0.1 + 0.03 * road.r;
      pos.push(x, y, z, x, y, z);
      nrm.push(-tz, tx, -tz, tx);
      hws.push(hw, hw);
      rank.push(road.r, road.r);
      side.push(-1, 1);
      along.push(acc, acc);
      if (i < n - 1) idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      v += 2;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aRank", new THREE.Float32BufferAttribute(rank, 1));
  g.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute("aAlong", new THREE.Float32BufferAttribute(along, 1));
  g.setAttribute("aN", new THREE.Float32BufferAttribute(nrm, 2));
  g.setAttribute("aHW", new THREE.Float32BufferAttribute(hws, 1));
  g.setIndex(idx);
  return g;
}

function Roads({ city }: { city: CityData }) {
  const geo = useMemo(() => roadGeometry(city.roads), [city]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: U,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        vertexShader: /* glsl */ `
          attribute float aRank, aSide, aAlong, aHW;
          attribute vec2 aN;
          varying float vRank, vSide, vAlong;
          varying vec3 vW;
          void main() {
            vRank = aRank; vSide = aSide; vAlong = aAlong;
            vec4 w = modelMatrix * vec4(position, 1.0);
            // Real width up close; never thinner than about a pixel and a half from the air.
            float dist = length(cameraPosition - w.xyz);
            float hw = max(aHW, dist * (0.0006 + 0.00034 * aRank));
            w.xz += aN * aSide * hw;
            vW = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader:
          COMMON +
          /* glsl */ `
          varying float vRank, vSide, vAlong;
          varying vec3 vW;
          void main() {
            float d = length(vW - cameraPosition);
            float core = 1.0 - abs(vSide);
            float lit = litAt(vW.xz);
            vec3 c = vec3(0.022, 0.026, 0.042);
            // Before the light arrives the street plan is only a trace in the moonlight.
            c += vec3(0.035, 0.05, 0.095) * (1.0 - lit) * (0.4 + 0.6 * core);
            // Streetlights: a rhythm of pools on the bigger roads, a steadier glow on the lanes.
            float pool = 0.5 + 0.5 * cos(vAlong / 30.0 * 6.2831);
            // From the air a road is one glowing line; up close it is dark tarmac between lamp pools.
            float near = 1.0 - smoothstep(250.0, 900.0, d);
            float lamps = mix(0.6, mix(0.2, 0.07 + 0.38 * pow(pool, 3.0), step(1.0, vRank)), near);
            vec3 amber = mix(vec3(1.0, 0.4, 0.09), vec3(1.0, 0.55, 0.2), vRank / 3.0);
            c += amber * lit * (0.3 + vRank * 0.36) * lamps * (0.3 + 0.7 * core) * 1.7;
            c += vec3(1.0, 0.6, 0.26) * frontAt(vW.xz) * (0.7 + vRank * 0.6) * (0.4 + 0.6 * core) * 2.2;
            gl_FragColor = vec4(fogged(c, d), 1.0);
            ${FINISH}
          }`,
      }),
    [],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={1} />;
}

/* ------------------------------------------------------------------ */
/* Points of light: streetlamps, distant town, traffic                 */
/* ------------------------------------------------------------------ */

const POINT_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSeed;
  uniform float uPx, uSize, uMin, uMax, uFadeFrom, uFadeTo;
  varying vec3 vC;
  varying float vLit;
  varying float vFog;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.75 + 0.25 * sin(uTime * (0.5 + aSeed * 1.6) + aSeed * 40.0);
    vC = aColor * tw;
    // Some lights only make sense from the air and step aside as the camera comes down.
    vLit = litAt(position.xz) * (uFadeTo > 0.0 ? smoothstep(uFadeFrom, uFadeTo, -mv.z) : 1.0);
    vFog = exp(-uFogDensity * uFogDensity * mv.z * mv.z);
    gl_PointSize = clamp(uSize / -mv.z, uMin, uMax) * uPx;
  }`;

const POINT_FRAGMENT = /* glsl */ `
  varying vec3 vC;
  varying float vLit;
  varying float vFog;
  void main() {
    // A soft disc with a bright core, so even a two-pixel light reads from the air.
    float a = (1.0 - smoothstep(0.12, 0.5, length(gl_PointCoord - 0.5))) * vLit * vFog;
    gl_FragColor = vec4(vC * a, a);
    ${FINISH}
  }`;

function pointMaterial(size: number, min: number, max: number, fade: [number, number] = [0, 0]) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uSize: { value: size }, uMin: { value: min }, uMax: { value: max }, uFadeFrom: { value: fade[0] }, uFadeTo: { value: fade[1] } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: COMMON + POINT_VERTEX,
    fragmentShader: POINT_FRAGMENT,
  });
}

function pointGeometry(pos: number[], col: number[], seed: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 1));
  return g;
}

/** A lamp head every 34 m along the main roads. */
function Streetlights({ city }: { city: CityData }) {
  const geo = useMemo(() => {
    const rand = seeded(5);
    const pos: number[] = [];
    const col: number[] = [];
    const seed: number[] = [];
    for (const road of city.roads) {
      if (road.r < 2) continue;
      const p = road.p;
      let acc = 0;
      let next = 0;
      for (let i = 1; i < p.length / 2; i++) {
        const x0 = p[2 * i - 2];
        const z0 = p[2 * i - 1];
        const l = Math.hypot(p[2 * i] - x0, p[2 * i + 1] - z0);
        while (next <= acc + l) {
          const t = (next - acc) / (l || 1);
          pos.push(x0 + (p[2 * i] - x0) * t, 9, z0 + (p[2 * i + 1] - z0) * t);
          col.push(1.5, 0.95, 0.5);
          seed.push(rand());
          next += 34;
        }
        acc += l;
      }
    }
    return pointGeometry(pos, col, seed);
  }, [city]);
  const mat = useMemo(() => pointMaterial(900, 2.2, 11), []);
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />;
}

/** One small light for most mapped buildings: from the air the town reads as a field of lit homes. */
function HomeLights({ city }: { city: CityData }) {
  const geo = useMemo(() => {
    const rand = seeded(13);
    const pos: number[] = [];
    const col: number[] = [];
    const seed: number[] = [];
    for (const b of city.buildings) {
      if (rand() > 0.72) continue;
      const n = b.p.length / 2 - 1;
      if (n < 3) continue;
      let cx = 0;
      let cz = 0;
      for (let k = 0; k < n; k++) {
        cx += b.p[2 * k];
        cz += b.p[2 * k + 1];
      }
      // Just above the roof, so the light is not hidden inside the building when seen from the air.
      pos.push(cx / n + (rand() - 0.5) * 6, (b.h ?? 12) + 2.5, cz / n + (rand() - 0.5) * 6);
      const cool = rand() > 0.9;
      const k = 0.7 + rand() * 0.7;
      col.push((cool ? 0.8 : 1.3) * k, (cool ? 0.92 : 0.82) * k, (cool ? 1.2 : 0.46) * k);
      seed.push(rand());
    }
    return pointGeometry(pos, col, seed);
  }, [city]);
  const mat = useMemo(() => pointMaterial(2400, 1.9, 3.4, [260, 900]), []);
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />;
}

/** Lights of the wider region beyond the mapped streets, so the horizon is never empty. */
function FarLights({ count }: { count: number }) {
  const geo = useMemo(() => {
    const rand = seeded(17);
    const pos: number[] = [];
    const col: number[] = [];
    const seed: number[] = [];
    for (let i = 0; i < count; i++) {
      const d = 4200 + 15000 * Math.pow(rand(), 1.6);
      const a = rand() * Math.PI * 2;
      // Thin out the south, where the coast and the Atlantic are.
      if (Math.sin(a) > 0.25 && rand() < 0.75) continue;
      const x = TOWN[0] + Math.cos(a) * d;
      const z = TOWN[2] + Math.sin(a) * d;
      if (Math.hypot(x - IKOT_OFFSET[0], z - IKOT_OFFSET[1]) < 2400) continue;
      // Small clusters read as villages rather than noise.
      const cluster = 1 + Math.floor(rand() * 4);
      for (let k = 0; k < cluster; k++) {
        pos.push(x + (rand() - 0.5) * 260, 4 + rand() * 8, z + (rand() - 0.5) * 260);
        const cool = rand() > 0.86;
        col.push(cool ? 0.85 : 1.25, cool ? 0.95 : 0.78, cool ? 1.2 : 0.42);
        seed.push(rand());
      }
    }
    return pointGeometry(pos, col, seed);
  }, [count]);
  const mat = useMemo(() => pointMaterial(2600, 1.7, 3.4), []);
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={2} />;
}

/** Headlights and tail-lights moving along the main roads. */
function Traffic({ city, count }: { city: CityData; count: number }) {
  const { geo, cars } = useMemo(() => {
    const rand = seeded(29);
    const lanes = city.roads
      .filter((r) => r.r >= 2 && r.p.length >= 6)
      .map((r) => {
        const cum = [0];
        for (let i = 1; i < r.p.length / 2; i++) cum.push(cum[i - 1] + Math.hypot(r.p[2 * i] - r.p[2 * i - 2], r.p[2 * i + 1] - r.p[2 * i - 1]));
        return { p: r.p, cum, length: cum[cum.length - 1] };
      })
      .filter((l) => l.length > 160);
    const total = lanes.reduce((s, l) => s + l.length, 0);
    const pos: number[] = [];
    const col: number[] = [];
    const seed: number[] = [];
    const cars: { lane: (typeof lanes)[number]; start: number; speed: number }[] = [];
    for (let i = 0; i < count && lanes.length; i++) {
      // Longer roads carry more cars.
      let pickAt = rand() * total;
      let lane = lanes[0];
      for (const l of lanes) {
        lane = l;
        if ((pickAt -= l.length) <= 0) break;
      }
      const forward = rand() > 0.5;
      cars.push({ lane, start: rand() * lane.length, speed: (16 + rand() * 14) * (forward ? 1 : -1) });
      pos.push(0, 1.2, 0);
      // Headlights one way, tail-lights the other.
      if (forward) col.push(1.5, 1.4, 1.15);
      else col.push(1.6, 0.22, 0.16);
      seed.push(rand());
    }
    return { geo: pointGeometry(pos, col, seed), cars };
  }, [city, count]);
  const mat = useMemo(() => pointMaterial(700, 2, 8), []);
  useFrame(({ clock }) => {
    if (world.reduced && clock.elapsedTime > 0.2) return;
    const attr = geo.attributes.position as THREE.BufferAttribute;
    const t = clock.elapsedTime;
    cars.forEach((car, i) => {
      const { p, cum, length } = car.lane;
      const s = (((car.start + car.speed * t) % length) + length) % length;
      let lo = 0;
      let hi = cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= s) lo = mid;
        else hi = mid;
      }
      const f = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
      attr.setXYZ(i, p[2 * lo] + (p[2 * hi] - p[2 * lo]) * f, 1.2, p[2 * lo + 1] + (p[2 * hi + 1] - p[2 * lo + 1]) * f);
    });
    attr.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={3} />;
}

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */

type Built = { pos: Float32Array; nor: Float32Array; col: Float32Array; roof: Float32Array };

/** Real footprints, extruded. Built in short slices so the page stays responsive while it loads. */
function Buildings({ city, onBuilt }: { city: CityData; onBuilt: () => void }) {
  const [data, setData] = useState<Built | null>(null);
  useEffect(() => {
    const rand = seeded(7);
    const walls = ["#8f8c92", "#807c85", "#9a968f", "#878994", "#a09a92"].map((c) => new THREE.Color(c));
    const roofs = ["#3d3f4c", "#4a4046", "#35394a", "#514a4c", "#2f3340"].map((c) => new THREE.Color(c));
    // The venue models stand on cleared ground: leave out any mapped building that would overlap one.
    const keepOut = SITES.map((s) => siteCenter(s));
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const roof: number[] = [];
    const ring: THREE.Vector2[] = [];
    const list = city.buildings;
    let i = 0;
    let dead = false;
    let handle = 0;
    const one = (b: (typeof list)[number]) => {
      const p = b.p;
      const n = p.length / 2 - 1;
      if (n < 3) return;
      let cx = 0;
      let cz = 0;
      for (let k = 0; k < n; k++) {
        cx += p[2 * k];
        cz += p[2 * k + 1];
      }
      cx /= n;
      cz /= n;
      if (keepOut.some((c) => Math.hypot(cx - c[0], cz - c[2]) < 40)) return;
      const h = b.h ?? 4 + 3.2 * Math.floor(rand() * rand() * 5) + 2 * rand();
      const wc = walls[Math.floor(rand() * walls.length)];
      const rc = roofs[Math.floor(rand() * roofs.length)];
      for (let k = 0; k < n; k++) {
        const x0 = p[2 * k];
        const z0 = p[2 * k + 1];
        const x1 = p[2 * k + 2];
        const z1 = p[2 * k + 3];
        const nx = z1 - z0;
        const nz = -(x1 - x0);
        const l = Math.hypot(nx, nz) || 1;
        pos.push(x0, 0, z0, x1, 0, z1, x1, h, z1, x0, 0, z0, x1, h, z1, x0, h, z0);
        for (let q = 0; q < 6; q++) {
          nor.push(nx / l, 0, nz / l);
          col.push(wc.r, wc.g, wc.b);
          roof.push(0);
        }
      }
      ring.length = 0;
      for (let k = 0; k < n; k++) ring.push(new THREE.Vector2(p[2 * k], p[2 * k + 1]));
      for (const [a, b2, c] of THREE.ShapeUtils.triangulateShape(ring, []))
        for (const q of [a, c, b2]) {
          pos.push(ring[q].x, h, ring[q].y);
          nor.push(0, 1, 0);
          col.push(rc.r, rc.g, rc.b);
          roof.push(1);
        }
    };
    const work = () => {
      if (dead) return;
      const until = performance.now() + 7;
      while (i < list.length && performance.now() < until) one(list[i++]);
      if (i < list.length) handle = window.setTimeout(work, 0);
      else {
        setData({ pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), roof: new Float32Array(roof) });
        onBuilt();
      }
    };
    handle = window.setTimeout(work, 0);
    return () => {
      dead = true;
      window.clearTimeout(handle);
    };
    // onBuilt is stable for the life of the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  const geo = useMemo(() => {
    if (!data) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(data.nor, 3));
    g.setAttribute("aTint", new THREE.BufferAttribute(data.col, 3));
    g.setAttribute("aRoof", new THREE.BufferAttribute(data.roof, 1));
    return g;
  }, [data]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: U,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          attribute vec3 aTint;
          attribute float aRoof;
          varying vec3 vW, vN, vTint;
          varying float vRoof;
          void main() {
            vTint = aTint; vRoof = aRoof;
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader:
          COMMON +
          /* glsl */ `
          varying vec3 vW, vN, vTint;
          varying float vRoof;
          void main() {
            float d = length(vW - cameraPosition);
            vec3 n = normalize(vN);
            float lit = litAt(vW.xz);
            // Moonlight from the north plus a cool sky fill.
            float moon = max(dot(n, normalize(vec3(-0.45, 0.8, 0.35))), 0.0);
            vec3 c = vTint * (vec3(0.05, 0.065, 0.12) + vec3(0.2, 0.24, 0.36) * moon);
            float wall = 1.0 - vRoof;
            // Streetlight washing up the lower walls.
            c += vTint * vec3(1.0, 0.56, 0.26) * 0.32 * lit * wall * (1.0 - smoothstep(0.0, 8.0, vW.y));
            // Lit windows on a regular grid; about a third of the rooms are in use.
            vec2 grid = vec2((vW.x + vW.z) / 3.4, vW.y / 3.1);
            vec2 cell = floor(grid);
            vec2 f = fract(grid);
            float win = step(0.28, f.x) * step(f.x, 0.72) * step(0.32, f.y) * step(f.y, 0.74) * step(1.0, vW.y);
            float on = step(0.66, hash21(cell + floor(vW.xz / 40.0)));
            vec3 warm = mix(vec3(1.0, 0.68, 0.36), vec3(0.8, 0.9, 1.0), step(0.88, hash21(cell * 1.7)));
            c += warm * win * on * wall * lit * 1.15 * (1.0 - smoothstep(500.0, 2600.0, d));
            c += vec3(1.0, 0.6, 0.3) * frontAt(vW.xz) * 0.5;
            gl_FragColor = vec4(fogged(c, d), 1.0);
            ${FINISH}
          }`,
      }),
    [],
  );
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo ? <mesh geometry={geo} material={mat} frustumCulled={false} /> : null;
}

/* ------------------------------------------------------------------ */
/* Water                                                               */
/* ------------------------------------------------------------------ */

function Water({ city }: { city: CityData }) {
  const geo = useMemo(() => {
    const pos: number[] = [];
    const idx: number[] = [];
    let v = 0;
    for (const r of city.rivers) {
      const p = r.p;
      const n = p.length / 2;
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - 1);
        const b = Math.min(n - 1, i + 1);
        let tx = p[2 * b] - p[2 * a];
        let tz = p[2 * b + 1] - p[2 * a + 1];
        const l = Math.hypot(tx, tz) || 1;
        tx /= l;
        tz /= l;
        const hw = r.w / 2;
        pos.push(p[2 * i] - tz * hw, 0.05, p[2 * i + 1] + tx * hw, p[2 * i] + tz * hw, 0.05, p[2 * i + 1] - tx * hw);
        if (i < n - 1) idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
        v += 2;
      }
    }
    for (const ring of city.areas) {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < ring.length - 2; i += 2) pts.push(new THREE.Vector2(ring[i], ring[i + 1]));
      if (pts.length < 3) continue;
      const base = v;
      for (const q of pts) pos.push(q.x, 0.04, q.y);
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(pts, [])) idx.push(base + a, base + c, base + b);
      v += pts.length;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }, [city]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: U,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        vertexShader: WORLD_VERTEX,
        fragmentShader:
          COMMON +
          /* glsl */ `
          varying vec3 vW;
          void main() {
            float d = length(vW - cameraPosition);
            vec3 view = normalize(cameraPosition - vW);
            float fres = pow(1.0 - max(view.y, 0.0), 3.0);
            float rip = sin(vW.x * 0.08 + uTime * 0.7) * sin(vW.z * 0.11 - uTime * 0.5);
            vec3 n = normalize(vec3(rip * 0.05, 1.0, rip * 0.04));
            vec3 c = mix(vec3(0.006, 0.014, 0.036), vec3(0.04, 0.065, 0.15), fres * 0.8);
            // The moon's path across the water.
            c += vec3(0.85, 0.9, 1.0) * pow(max(dot(reflect(-view, n), uMoon), 0.0), 220.0) * 0.8;
            gl_FragColor = vec4(fogged(c, d), 1.0);
            ${FINISH}
          }`,
      }),
    [],
  );
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}

/* ------------------------------------------------------------------ */

/** The real street map of Eket and Ikot Abasi at night. */
export function EketMap({ cars, farLights, onReady }: { cars: number; farLights: number; onReady: () => void }) {
  const [city, setCity] = useState<CityData | null>(null);
  const dpr = useThree((s) => s.viewport.dpr);
  const built = useRef(false);
  const told = useRef(false);
  useEffect(() => {
    let alive = true;
    loadCity().then((c) => alive && setCity(c));
    return () => {
      alive = false;
    };
  }, []);
  useFrame(({ clock }) => {
    U.uReach.value = world.reach;
    U.uTime.value = world.reduced ? 0 : clock.elapsedTime;
    U.uPx.value = dpr;
    // Ready only once the buildings exist, so the intro never competes with that work.
    if (built.current && !told.current) {
      told.current = true;
      onReady();
    }
  });
  return (
    <group>
      <Ground />
      <FarLights count={farLights} />
      {city && (
        <>
          <Water city={city} />
          <Roads city={city} />
          <Streetlights city={city} />
          <HomeLights city={city} />
          <Buildings
            city={city}
            onBuilt={() => {
              built.current = true;
            }}
          />
          <Traffic key={cars} city={city} count={cars} />
        </>
      )}
    </group>
  );
}
