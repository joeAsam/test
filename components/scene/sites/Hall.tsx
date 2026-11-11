"use client";

import type { V3 } from "@/lib/journey";
import { DAY_COLORS } from "@/lib/journey";
import { Box, Cyl, Figures, Inst, Lamps, Plinth, Pools, Sign, Strings, Trees, faceTo, geo, seeded, type Figure, type Item, type Pool } from "../kit";
import { P } from "./palette";

const rand = seeded(31);

/** Hotel windows: most rooms lit, some dark. */
const windows: Item[] = [];
for (let floor = 0; floor < 7; floor++) {
  const y = 2.9 + floor * 1.85;
  for (let col = 0; col < 4; col++) windows.push({ p: [-7.2 + col * 1.8, y, -0.97], s: [1.05, 1.2, 1], c: rand() > 0.25 ? (rand() > 0.5 ? P.glass : P.glassDeep) : P.dark });
  for (let col = 0; col < 3; col++) windows.push({ p: [-0.22, y, -6.6 + col * 2.1], s: [1.05, 1.2, 1], r: [0, Math.PI / 2, 0], c: rand() > 0.35 ? P.glass : P.dark });
}

const speaker: V3 = [-6.2, 0.4, 6.4];

/** Attendees in loose arcs, all turned toward the speaker. */
const figures: Figure[] = [{ p: [speaker[0], 0.4, speaker[2]], face: Math.PI / 2 + 0.25 }];
[3.4, 5.2, 7].forEach((radius, ring) => {
  const n = 4 + ring;
  for (let i = 0; i < n; i++) {
    const a = -0.9 + (i / (n - 1)) * 1.45 + (rand() - 0.5) * 0.12;
    const p: V3 = [speaker[0] + Math.cos(a) * radius * 1.25, 0, speaker[2] + Math.sin(a) * radius * 0.9 + 0.6];
    figures.push({ p, face: faceTo(p, speaker), h: 0.94 + rand() * 0.1 });
  }
});
figures.push({ p: [4.2, 0.3, 2.6], face: 0.3 }, { p: [5.5, 0.3, 2.7], face: -0.4 });

const flagPoles: Item[] = [0, 1, 2].map((i) => ({ p: [9.4 + i * 1.05, 2.8, 5.2 - i * 1.8] as V3, s: [1, 5.6, 1] as V3, c: P.concrete }));
const flags: Item[] = [0, 1, 2].map((i) => ({ p: [10.1 + i * 1.05, 5, 5.2 - i * 1.8] as V3, s: [1.3, 0.8, 0.05] as V3, c: P.stone }));

const trees = [
  { p: [-11.4, 0, -1.5] as V3, s: 1.1 },
  { p: [-11, 0, 3.2] as V3, s: 0.85 },
  { p: [11.6, 0, -4] as V3, s: 1 },
  { p: [1, 0, -10.8] as V3, s: 1.1 },
  { p: [8.4, 0, -9.6] as V3, s: 0.9 },
];
const lamps = [{ p: [-9, 0, 8.6] as V3 }, { p: [1.2, 0, 11.2] as V3 }, { p: [9.2, 0, 8.6] as V3 }];
const strands: [V3, V3][] = [
  [[-0.4, 9.5, -1.1], [1.2, 3.6, 11.2]],
  [[1.2, 3.6, 11.2], [9.2, 3.6, 8.6]],
  [[-9, 3.6, 8.6], [1.2, 3.6, 11.2]],
];
const pools: Pool[] = [
  { p: [5.2, 0.12, 3], r: 6.5, c: "#ffc98a", o: 0.5 },
  { p: [-4.5, 0.12, 1.6], r: 4.5, c: "#ffc98a", o: 0.4 },
  { p: [-5, 0.12, 6.5], r: 5.5, c: "#ffd9a8", o: 0.32 },
];

/** Day 1: DE Exchange Hall. The hotel tower, the hall's glazed front and the forecourt set for the session. */
export function Hall() {
  return (
    <group>
      <Plinth color={DAY_COLORS[0]} />
      <Cyl p={[0.5, 0.08, 5]} s={[9.8, 9.8, 0.06]} seg={64} c={P.paving} />

      {/* Hotel tower */}
      <Box p={[-4.5, 7.6, -4.5]} s={[8.5, 15.2, 7]} c={P.stone} />
      <Box p={[-4.5, 15.35, -4.5]} s={[8.9, 0.3, 7.4]} c={P.charcoal} />
      <Box p={[-4.5, 16.4, -1.7]} s={[7.2, 1.3, 0.16]} c={P.charcoal} />
      <Sign text="DE EXCHANGE" p={[-4.5, 16.4, -1.6]} w={6.4} h={0.82} c="#ffe2bd" glow={2.2} />
      <Inst g={geo.plane()} items={windows} glow={1.45} />
      <Box p={[-4.5, 1.25, -0.95]} s={[2.3, 2.5, 0.16]} c={P.glass} glow={1.5} />
      <Box p={[-4.5, 2.75, -0.35]} s={[3.6, 0.14, 1.5]} c={P.charcoal} />
      <Box p={[-8.3, 0.45, 0]} s={[2.6, 0.9, 0.9]} c={P.hedge} />
      <Box p={[-0.9, 0.45, 0]} s={[2.2, 0.9, 0.9]} c={P.hedge} />

      {/* Exchange Hall */}
      <Box p={[5.2, 2.6, -3.5]} s={[9, 5.2, 7]} c={P.stoneWarm} />
      <Box p={[5.2, 5.33, -3.5]} s={[9.4, 0.26, 7.4]} c={P.slate} />
      <Box p={[5.2, 2.35, 0.02]} s={[7.4, 3.7, 0.12]} c={P.glass} glow={1.35} />
      {[1.5, 2.72, 3.94, 5.2, 6.46, 7.68, 8.9].map((x) => (
        <Box key={x} p={[x, 2.35, 0.08]} s={[0.1, 3.7, 0.12]} round={0.02} c={P.charcoal} />
      ))}
      <Box p={[5.2, 4.4, 1.2]} s={[8.2, 0.14, 2.5]} c={P.charcoal} />
      <Cyl p={[1.5, 2.2, 2.2]} s={[0.07, 0.07, 4.4]} seg={10} c={P.concrete} />
      <Cyl p={[8.9, 2.2, 2.2]} s={[0.07, 0.07, 4.4]} seg={10} c={P.concrete} />
      <Sign text="LEADERSHIP SESSION" p={[5.2, 4.85, 2.47]} w={6.2} h={0.5} c="#fff1dc" glow={2} weight={500} />
      <Box p={[5.2, 0.12, 2.9]} s={[6.6, 0.24, 1.5]} c={P.pavingLight} />

      {/* Speaker's platform */}
      <Box p={[-6.4, 0.2, 6.4]} s={[3.2, 0.4, 2.8]} c={P.timber} />
      <Box p={[-5.3, 1, 6.6]} s={[0.6, 1.2, 0.5]} c={P.charcoal} />

      <Inst g={geo.cyl(0.05, 0.05, 1, 8)} items={flagPoles} />
      <Inst g={geo.box(1, 1, 1, 0.02)} items={flags} />

      <Figures items={figures} />
      <Trees items={trees} seed={6} />
      <Lamps items={lamps} />
      <Strings strands={strands} />
      <Pools items={pools} />
    </group>
  );
}
