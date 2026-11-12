"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { V3 } from "@/lib/journey";
import { DAY_COLORS } from "@/lib/journey";
import { world } from "@/lib/world";
import { Ball, Beam, Box, Inst, Lamps, Palms, Plinth, Pools, Sign, Strings, geo, seeded, type Item, type Pool } from "../kit";
import { Figures, type Figure } from "../People";
import { P } from "./palette";

const SITE = 1;
const rand = seeded(57);

/** Three staggered rows of low loungers facing the screen. */
const loungers: Item[] = [];
const cushions: Item[] = [];
const viewers: Figure[] = [];
[-0.4, 2, 4.4].forEach((z, row) => {
  for (let i = 0; i < 6; i++) {
    const x = -1.6 + i * 2 + (row % 2) * 0.9;
    loungers.push({ p: [x, 0.22, z], s: [0.9, 0.24, 1.7], c: P.timber });
    cushions.push({ p: [x, 0.4, z + 0.1], s: [0.8, 0.14, 1.4], c: P.linen });
    // Most loungers are taken; viewers sit facing the screen (toward -Z).
    if ((i + row * 2) % 5 !== 3) viewers.push({ p: [x, 0, z + 0.25], face: Math.PI, sit: true, h: 0.96 });
  }
});

const figures: Figure[] = [
  { p: [-4.4, 0, 6.8], face: 2.6 },
  { p: [-6.6, 0, 4.4], face: 1.1 },
  { p: [-3.3, 0, 3.7], face: -2.2, h: 0.95 },
  { p: [7.6, 0, 7.6], face: Math.PI + 0.3 },
  { p: [8.6, 0, 7.2], face: Math.PI - 0.2, h: 0.96 },
  { p: [12.6, 0, 7.6], face: -1.9 },
];

const windows: Item[] = [];
for (let floor = 0; floor < 3; floor++)
  for (let col = 0; col < 4; col++) windows.push({ p: [-10.3 + col * 1.55, 1.7 + floor * 1.9, -5.47], s: [0.95, 1.1, 1], c: rand() > 0.3 ? (rand() > 0.5 ? P.glass : P.glassDeep) : P.dark });

const lamps = [{ p: [-3.6, 0, 9] as V3 }, { p: [9.2, 0, 10] as V3 }];
const strands: [V3, V3][] = [
  [[-2.4, 9, -6.4], [-3.6, 3.6, 9]],
  [[9.4, 9, -6.4], [9.2, 3.6, 10]],
  [[-3.6, 3.6, 9], [9.2, 3.6, 10]],
];
const palms = [{ p: [-12.2, 0, 1.4] as V3, lean: -0.16 }, { p: [12.9, 0, -3.8] as V3, s: 1.1, lean: 0.2 }, { p: [-9.4, 0, 9.4] as V3, s: 0.9, lean: -0.1 }];
const pools: Pool[] = [
  { p: [3.5, 0.12, 1], r: 9.5, c: "#a9c4ff", o: 0.4 },
  { p: [10.2, 0.22, 3], r: 5.5, c: "#3fd6dc", o: 0.5 },
  { p: [-5.2, 0.12, 5.4], r: 3.4, c: "#ffd9a8", o: 0.45 },
];

/** The "film": a sunset walk along a ridge that loops forever. */
function useFilm() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          float hill(float x, float f, float a, float o) { return o + sin(x * f) * a + sin(x * f * 2.3 + 1.7) * a * 0.4; }
          void main() {
            vec2 uv = vUv;
            float t = uTime;
            vec3 col = mix(vec3(0.95, 0.56, 0.34), vec3(0.24, 0.2, 0.5), smoothstep(0.2, 1.0, uv.y));
            float sun = smoothstep(0.17, 0.15, distance(uv * vec2(1.9, 1.0), vec2(1.2, 0.5)));
            col = mix(col, vec3(1.0, 0.9, 0.7), sun);
            col = mix(col, vec3(0.28, 0.18, 0.4), step(uv.y, hill(uv.x + t * 0.02, 5.0, 0.05, 0.42)));
            col = mix(col, vec3(0.15, 0.1, 0.26), step(uv.y, hill(uv.x + t * 0.05, 8.0, 0.04, 0.3)));
            col = mix(col, vec3(0.05, 0.04, 0.12), step(uv.y, 0.17));
            for (int i = 0; i < 2; i++) {
              float fi = float(i);
              vec2 c = vec2(0.42 + fi * 0.09 + sin(t * 0.25) * 0.05, 0.17 + abs(sin(t * 3.0 + fi * 1.4)) * 0.012);
              float body = step(abs(uv.x - c.x), 0.012) * step(c.y, uv.y) * step(uv.y, c.y + 0.11);
              float head = step(distance((uv - vec2(c.x, c.y + 0.135)) * vec2(1.9, 1.0), vec2(0.0)), 0.026);
              col = mix(col, vec3(0.04, 0.03, 0.1), max(body, head));
            }
            col *= 0.94 + 0.06 * sin(t * 21.0);
            gl_FragColor = vec4(col * 1.35, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  useFrame(({ clock }) => {
    if (world.focus[SITE] > 0.02 && !world.reduced) mat.uniforms.uTime.value = clock.elapsedTime;
  });
  return mat;
}

/** Day 2: Royalty Hotels. An open-air screen on the lawn, loungers, the bar and the pool. */
export function Cinema() {
  const film = useFilm();
  return (
    <group>
      <Plinth color={DAY_COLORS[1]} />

      {/* Hotel block */}
      <Box p={[-8, 3.2, -7.5]} s={[7, 6.4, 4]} c={P.stone} />
      <Box p={[-8, 6.53, -7.5]} s={[7.4, 0.26, 4.4]} c={P.slate} />
      <Inst g={geo.plane()} items={windows} glow={1.45} />
      <Sign text="ROYALTY" p={[-8, 7.3, -5.6]} w={3.8} h={0.7} c="#ffe2bd" glow={2.2} />

      {/* Screen */}
      <Box p={[3.5, 5.5, -6.5]} s={[12.4, 6.8, 0.3]} c={P.charcoal} />
      <mesh geometry={geo.plane()} material={film} position={[3.5, 5.5, -6.33]} scale={[11.9, 6.3, 1]} />
      <Box p={[-1.6, 1.05, -6.6]} s={[0.3, 2.1, 0.3]} c={P.charcoal} />
      <Box p={[8.6, 1.05, -6.6]} s={[0.3, 2.1, 0.3]} c={P.charcoal} />

      {/* Projector */}
      <Box p={[3.5, 1.1, 8]} s={[0.5, 2.2, 0.5]} c={P.charcoal} />
      <Box p={[3.5, 2.5, 8]} s={[1.1, 0.55, 0.9]} c={P.slate} />
      <Ball p={[3.5, 2.55, 7.5]} s={0.14} c="#dfe9ff" glow={3} />
      <Beam p={[3.5, 2.55, 7.45]} to={[3.5, 5.5, -6.3]} spread={4.6} c="#b9ccff" power={0.16} island={SITE} />

      {/* Bar */}
      <Box p={[-5.2, 0.6, 5.4]} s={[2.6, 1.2, 1.3]} c={P.charcoal} />
      <Box p={[-5.2, 1.24, 5.4]} s={[2.8, 0.08, 1.5]} c={P.timber} />
      <Box p={[-5.2, 1.7, 4.85]} s={[2.4, 0.7, 0.08]} c={P.glass} glow={1.4} />
      <Box p={[-5.2, 2.75, 5.4]} s={[3.2, 0.12, 2]} c={P.charcoal} />
      <Box p={[-6.7, 1.38, 6.3]} s={[0.08, 2.75, 0.08]} round={0.02} c={P.concrete} />
      <Box p={[-3.7, 1.38, 6.3]} s={[0.08, 2.75, 0.08]} round={0.02} c={P.concrete} />

      {/* Pool */}
      <Box p={[10.2, 0.1, 3]} s={[5.6, 0.2, 7.6]} c={P.stone} />
      <Box p={[10.2, 0.17, 3]} s={[4.7, 0.14, 6.7]} round={0.03} c={P.water} rough={0.2} emit={0.9} shadow={false} />

      <Inst g={geo.box(1, 1, 1, 0.04)} items={loungers} />
      <Inst g={geo.box(1, 1, 1, 0.06)} items={cushions} />
      <Figures items={figures} seed={21} />
      <Figures items={viewers} seed={22} />
      <Palms items={palms} seed={12} />
      <Lamps items={lamps} />
      <Strings strands={strands} />
      <Pools items={pools} />
    </group>
  );
}
