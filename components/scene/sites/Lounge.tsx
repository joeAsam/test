"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";
import type { V3 } from "@/lib/journey";
import { DAY_COLORS } from "@/lib/journey";
import { world } from "@/lib/world";
import { Ball, Beam, Box, Cyl, Figures, Inst, Plinth, Pools, Sign, Strings, Trees, faceTo, geo, seeded, type Figure, type Item, type Pool } from "../kit";
import { P } from "./palette";

const SITE = 3;
const rand = seeded(91);

const PINK = "#ff6fb1";
const CYAN = "#7fd9ff";
const VIOLET = "#a98cff";

/** Light-up dance floor, six tiles by four. */
const tiles: Item[] = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) tiles.push({ p: [-3.25 + i * 1.3, 0.12, 2.1 + j * 1.3], c: (i + j) % 2 ? "#ff9ccb" : "#f3e9ff" });

const poolTable: V3 = [-8.6, 0, 2.2];
const pingTable: V3 = [8.7, 0, 2.6];

const figures: Figure[] = [
  ...Array.from({ length: 8 }, (_, i) => ({
    p: [-2.8 + (i % 4) * 1.8 + (rand() - 0.5) * 0.6, 0.18, 2.6 + Math.floor(i / 4) * 2.2 + (rand() - 0.5) * 0.7] as V3,
    face: rand() * Math.PI * 2,
    h: 0.92 + rand() * 0.12,
  })),
  { p: [-8.6, 0, 3.9], face: Math.PI },
  { p: [-10.9, 0, 2], face: Math.PI / 2 },
  { p: [6.3, 0, 2.6], face: Math.PI / 2 },
  { p: [11.1, 0, 2.6], face: -Math.PI / 2 },
  { p: [0, 0, -2.6], face: 0 },
  { p: [-7.6, 0, 8.4], face: faceTo([-7.6, 0, 8.4], [-9.4, 0, 8.4]) },
  { p: [7.4, 0, 9], face: faceTo([7.4, 0, 9], [9.2, 0, 8.6]) },
];

const balls: Item[] = [
  [-9.6, 2.5, "#e3bb62"], [-9, 1.9, "#a8322f"], [-8.3, 2.4, "#2b5fc0"], [-7.7, 2, "#f2efe8"], [-8.9, 2.6, "#171923"],
].map(([x, z, c]) => ({ p: [x as number, 1.22, z as number] as V3, c: c as string }));

const legs: Item[] = [
  ...[-1.4, 1.4].flatMap((dx) => [-0.75, 0.75].map((dz) => ({ p: [poolTable[0] + dx, 0.45, poolTable[2] + dz] as V3 }))),
  ...[-1.4, 1.4].flatMap((dx) => [-0.7, 0.7].map((dz) => ({ p: [pingTable[0] + dx, 0.45, pingTable[2] + dz] as V3 }))),
].map((it) => ({ ...it, s: [1, 0.9, 1] as V3, c: P.charcoal }));

/** Two lounge corners: a low sofa, a table and a candle each. */
const sofas: Item[] = [
  { p: [-10.4, 0.35, 8.4], s: [0.9, 0.7, 2.6], c: P.slate },
  { p: [-9.6, 0.7, 8.4], s: [0.3, 0.6, 2.6], c: P.slate, r: [0, 0, 0] },
  { p: [10.2, 0.35, 8.6], s: [0.9, 0.7, 2.6], c: P.slate },
  { p: [9.4, 0.7, 8.6], s: [0.3, 0.6, 2.6], c: P.slate },
];
const sideTables: Item[] = [{ p: [-8.3, 0.25, 8.4], c: P.charcoal }, { p: [8.1, 0.25, 8.6], c: P.charcoal }];
const candles: Item[] = sideTables.map((t) => ({ p: [t.p[0], 0.62, t.p[2]], c: "#ffe2b8" }));

const trees = [{ p: [12.2, 0, -5] as V3 }, { p: [-12.4, 0, -4.6] as V3, s: 0.9 }, { p: [12.4, 0, 5.4] as V3, s: 0.8 }];
const strands: [V3, V3][] = [
  [[-7.4, 8, 4.4], [-7.4, 5.8, -3.6]],
  [[7.4, 8, 4.4], [7.4, 5.8, -3.6]],
];
const pools: Pool[] = [
  { p: [0, 0.2, 4], r: 7, c: PINK, o: 0.42 },
  { p: [-8.6, 0.12, 2.4], r: 4.4, c: "#6fe0b2", o: 0.3 },
  { p: [8.7, 0.12, 2.6], r: 4.4, c: CYAN, o: 0.3 },
  { p: [0, 0.12, -2.4], r: 5, c: VIOLET, o: 0.4 },
];

function MirrorBall() {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current && world.focus[SITE] > 0.02 && !world.reduced) ref.current.rotation.y += dt * 0.4;
  });
  return (
    <group ref={ref} position={[0, 6.9, 4.2]}>
      <Ball s={0.6} seg={14} c="#dfe5ff" rough={0.16} metal={0.9} emit={0.2} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2;
        return <Ball key={i} p={[Math.cos(a) * 0.59, Math.sin(i * 1.7) * 0.3, Math.sin(a) * 0.59]} s={0.05} seg={8} c="#ffffff" glow={3} />;
      })}
    </group>
  );
}

/** Day 4: Blade Lounge. A dark pavilion edged in neon, a lit dance floor and the game tables. */
export function Lounge() {
  return (
    <group>
      <Plinth color={DAY_COLORS[3]} top="#15303a" />
      <Cyl p={[0, 0.08, 3.4]} s={[11.8, 11.8, 0.06]} seg={64} c={P.paving} />

      {/* Pavilion with neon trim */}
      <Box p={[0, 2.8, -6.6]} s={[15, 5.6, 6]} c={P.charcoal} />
      <Box p={[0, 5.7, -6.6]} s={[15.5, 0.22, 6.5]} c="#0f1118" />
      <Box p={[0, 5.5, -3.55]} s={[15.1, 0.07, 0.07]} round={0.03} c={PINK} glow={2.8} />
      <Box p={[0, 0.2, -3.55]} s={[15.1, 0.06, 0.06]} round={0.03} c={CYAN} glow={2.2} />
      <Box p={[-7.52, 2.85, -3.55]} s={[0.06, 5.3, 0.06]} round={0.03} c={VIOLET} glow={2.2} />
      <Box p={[7.52, 2.85, -3.55]} s={[0.06, 5.3, 0.06]} round={0.03} c={VIOLET} glow={2.2} />
      <Box p={[0, 1.35, -3.57]} s={[2.2, 2.7, 0.1]} c="#cbb8ff" glow={1.2} />
      <Box p={[-4.7, 2.5, -3.57]} s={[4.3, 1.7, 0.08]} c="#5a3bd0" glow={1} />
      <Box p={[4.7, 2.5, -3.57]} s={[4.3, 1.7, 0.08]} c="#5a3bd0" glow={1} />
      <Cyl p={[-4.2, 6.35, -4.7]} s={[0.04, 0.04, 1.1]} seg={8} c="#0f1118" />
      <Cyl p={[4.2, 6.35, -4.7]} s={[0.04, 0.04, 1.1]} seg={8} c="#0f1118" />
      <Sign text="BLADE LOUNGE" p={[0, 6.75, -4.6]} w={9} h={1.05} c={PINK} glow={3} weight={500} />
      <Sign text="GAMES NIGHT" p={[0, 4.3, -3.5]} w={4.6} h={0.5} c={CYAN} glow={2.6} weight={500} />

      {/* DJ booth and speakers */}
      <Box p={[0, 0.8, -1.7]} s={[3.6, 1.6, 1]} c="#0f1118" />
      <Box p={[0, 1.2, -1.18]} s={[3.2, 0.06, 0.04]} round={0.02} c={PINK} glow={2.6} />
      <Box p={[-2.9, 1.15, -1.9]} s={[1, 2.3, 1]} c={P.charcoal} />
      <Box p={[2.9, 1.15, -1.9]} s={[1, 2.3, 1]} c={P.charcoal} />
      <Cyl p={[-2.9, 1.5, -1.39]} s={[0.3, 0.3, 0.04]} r={[Math.PI / 2, 0, 0]} c={P.slate} />
      <Cyl p={[2.9, 1.5, -1.39]} s={[0.3, 0.3, 0.04]} r={[Math.PI / 2, 0, 0]} c={P.slate} />

      {/* Lighting truss over the dance floor */}
      <Cyl p={[-7.4, 4, 4.4]} s={[0.09, 0.11, 8]} seg={10} c={P.charcoal} />
      <Cyl p={[7.4, 4, 4.4]} s={[0.09, 0.11, 8]} seg={10} c={P.charcoal} />
      <Box p={[0, 8, 4.4]} s={[15, 0.2, 0.2]} c={P.charcoal} />
      <Cyl p={[0, 7.7, 4.2]} s={[0.02, 0.02, 0.6]} seg={6} c="#dfe5ff" />
      <MirrorBall />
      <Beam p={[-5, 7.85, 4.4]} to={[-2, 0.2, 3.5]} spread={2.2} c={PINK} power={0.3} island={SITE} sweep={0.4} speed={0.7} />
      <Beam p={[-1.7, 7.85, 4.4]} to={[1, 0.2, 5.5]} spread={2} c={CYAN} power={0.28} island={SITE} sweep={0.38} speed={0.55} phase={1.6} />
      <Beam p={[1.7, 7.85, 4.4]} to={[-1, 0.2, 5]} spread={2} c={VIOLET} power={0.3} island={SITE} sweep={0.38} speed={0.6} phase={3.1} />
      <Beam p={[5, 7.85, 4.4]} to={[2.4, 0.2, 3.4]} spread={2.2} c="#ffe2b8" power={0.26} island={SITE} sweep={0.4} speed={0.8} phase={4.4} />

      <Inst g={geo.box(1.24, 0.08, 1.24, 0.02)} items={tiles} glow={0.95} />

      {/* Pool table and table tennis */}
      <Box p={[poolTable[0], 0.98, poolTable[2]]} s={[3.6, 0.3, 2.1]} c={P.timber} />
      <Box p={[poolTable[0], 1.1, poolTable[2]]} s={[3.2, 0.1, 1.7]} round={0.02} c="#1c7d55" emit={0.25} />
      <Inst g={geo.ball(0.1, 10)} items={balls} />
      <Box p={[pingTable[0], 1, pingTable[2]]} s={[3.5, 0.1, 1.9]} round={0.02} c="#1f4f9c" emit={0.25} />
      <Box p={[pingTable[0], 1.2, pingTable[2]]} s={[0.04, 0.28, 1.95]} round={0.01} c="#f2efe8" />
      <Inst g={geo.cyl(0.06, 0.06, 1, 8)} items={legs} />

      {/* Lounge corners */}
      <Inst g={geo.box(1, 1, 1, 0.08)} items={sofas} />
      <Inst g={geo.cyl(0.45, 0.45, 0.5, 20)} items={sideTables} />
      <Inst g={geo.ball(0.09, 10)} items={candles} glow={3} />

      <Figures items={figures} />
      <Trees items={trees} seed={17} />
      <Strings strands={strands} />
      <Pools items={pools} />
    </group>
  );
}
