"use client";

import type { V3 } from "@/lib/journey";
import { DAY_COLORS } from "@/lib/journey";
import { Ball, Beam, Box, Cyl, Figures, Inst, Lamps, Plinth, Pools, Sign, Strings, Trees, faceTo, geo, seeded, type Figure, type Item, type Pool } from "../kit";
import { P } from "./palette";

const SITE = 4;
const rand = seeded(113);

/** Six round tables either side of the aisle. */
const TABLES: V3[] = [
  [-3.4, 0, 1.4], [3.4, 0, 1.4],
  [-6.3, 0, -1.4], [6.3, 0, -1.4],
  [-3.4, 0, -4], [3.4, 0, -4],
];

const cloths: Item[] = TABLES.map((t) => ({ p: [t[0], 0.4, t[2]], c: "#f4f1ea" }));
const candles: Item[] = TABLES.map((t) => ({ p: [t[0], 0.98, t[2]], c: "#ffe2b8" }));
const chairs: Item[] = [];
const figures: Figure[] = [];
TABLES.forEach((t, ti) => {
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + ti;
    const p: V3 = [t[0] + Math.cos(a) * 1.6, 0, t[2] + Math.sin(a) * 1.6];
    chairs.push({ p: [p[0], 0.42, p[2]], s: [0.42, 0.84, 0.42], r: [0, -a, 0], c: P.linen });
    // A few guests have arrived early and stand by their tables.
    if (rand() > 0.82) figures.push({ p: [t[0] + Math.cos(a) * 2.3, 0, t[2] + Math.sin(a) * 2.3], face: faceTo(p, t), h: 0.94 + rand() * 0.1 });
  }
});
figures.push(
  { p: [-1.4, 0.9, -8.8], face: 0.25 },
  { p: [1.6, 0.9, -8.6], face: -0.3 },
  { p: [-0.5, 0.1, 9.4], face: Math.PI },
  { p: [0.6, 0.1, 10.6], face: Math.PI, h: 0.95 },
  { p: [0, 0.1, 7.2], face: Math.PI },
);

/** Rope posts down both sides of the red carpet. */
const posts: Item[] = [];
const postTops: Item[] = [];
for (let i = 0; i < 4; i++) {
  for (const x of [-1.6, 1.6]) {
    const z = 5.6 + i * 2.4;
    posts.push({ p: [x, 0.5, z], s: [1, 1, 1], c: P.gold });
    postTops.push({ p: [x, 1.05, z], c: "#ffe2b8" });
  }
}

/** Left and right poles, front to back. Lights zigzag between them to make a ceiling of bulbs. */
const POLES: V3[] = [[-8.2, 0, 3.8], [8.2, 0, 3.8], [-8.2, 0, -1], [8.2, 0, -1], [-8.2, 0, -5.8], [8.2, 0, -5.8]];
const poles: Item[] = POLES.map((p) => ({ p: [p[0], 2.4, p[2]], s: [1, 4.8, 1], c: P.stone }));
const top = (p: V3): V3 => [p[0], 4.7, p[2]];
const strands: [V3, V3][] = [
  [top(POLES[0]), top(POLES[1])],
  [top(POLES[2]), top(POLES[3])],
  [top(POLES[4]), top(POLES[5])],
  [top(POLES[0]), top(POLES[3])],
  [top(POLES[1]), top(POLES[2])],
  [top(POLES[2]), top(POLES[5])],
  [top(POLES[3]), top(POLES[4])],
  [top(POLES[0]), top(POLES[2])],
  [top(POLES[2]), top(POLES[4])],
  [top(POLES[1]), top(POLES[3])],
  [top(POLES[3]), top(POLES[5])],
];

const topiary: Item[] = [[-2.9, 12.2], [2.9, 12.2], [-11.4, 2], [11.4, 2]].map(([x, z]) => ({ p: [x, 1.4, z] as V3, s: 0.75, c: P.hedge }));
const topiaryStems: Item[] = topiary.map((t) => ({ p: [t.p[0], 0.45, t.p[2]], s: [1, 0.9, 1], c: "#3a2e28" }));
const trees = [{ p: [11, 0, 8.4] as V3, s: 0.95 }, { p: [-12.2, 0, -3.4] as V3 }, { p: [12.3, 0, -4.2] as V3, s: 1.05 }];
const lamps = [{ p: [-4.6, 0, 11] as V3, h: 3.2 }, { p: [4.6, 0, 11] as V3, h: 3.2 }];

const pools: Pool[] = [
  { p: [0, 0.12, -1], r: 11.5, c: "#ffd29a", o: 0.42 },
  { p: [0, 0.95, -9], r: 6, c: P.gold, o: 0.42 },
  { p: [0, 0.14, 9], r: 4, c: "#ff9a7a", o: 0.3 },
  { p: [-10.4, 0.2, 8], r: 3.2, c: "#7fd9ff", o: 0.38 },
];

/** Day 5: Dinner & Awards Night. Dressed tables under a ceiling of lights, the red carpet and the stage. */
export function Gala() {
  return (
    <group>
      <Plinth color={DAY_COLORS[4]} />

      {/* Red carpet */}
      <Box p={[0, 0.09, 8.9]} s={[2.4, 0.06, 9.6]} round={0.02} c={P.carpet} />
      <Inst g={geo.cyl(0.05, 0.07, 1, 10)} items={posts} />
      <Inst g={geo.ball(0.09, 10)} items={postTops} glow={2.4} />

      {/* Poles for the ceiling of lights */}
      <Inst g={geo.cyl(0.08, 0.1, 1, 10)} items={poles} />

      {/* Tables */}
      <Inst g={geo.cyl(1.05, 1.1, 0.8, 32)} items={cloths} />
      <Inst g={geo.ball(0.1, 10)} items={candles} glow={3.2} />
      <Inst g={geo.box(1, 1, 1, 0.05)} items={chairs} />

      {/* Stage */}
      <Box p={[0, 0.45, -9.2]} s={[11.4, 0.9, 4]} c={P.slate} />
      <Box p={[0, 3.5, -11]} s={[11.4, 5.2, 0.3]} c={P.charcoal} />
      <Sign text="AWARDS NIGHT" p={[0, 4.7, -10.82]} w={7.4} h={0.95} c="#ffd98a" glow={2.8} weight={500} />
      <Box p={[0, 3.6, -10.82]} s={[6.2, 0.04, 0.04]} round={0.02} c={P.gold} glow={2.2} />
      <Box p={[0, 1.3, -9.2]} s={[0.9, 0.8, 0.9]} c={P.stone} />
      <Cyl p={[0, 1.8, -9.2]} s={[0.24, 0.3, 0.2]} seg={20} c={P.gold} rough={0.3} metal={0.75} emit={0.45} />
      <Cyl p={[0, 2.06, -9.2]} s={[0.06, 0.06, 0.34]} seg={10} c={P.gold} rough={0.3} metal={0.75} emit={0.45} />
      <Cyl p={[0, 2.52, -9.2]} s={[0.36, 0.16, 0.6]} seg={24} c={P.gold} rough={0.25} metal={0.8} emit={0.55} />
      <Ball p={[0, 3.02, -9.2]} s={0.08} c="#fff0d0" glow={3.4} />
      <Beam p={[-5.3, 6.3, -10.7]} to={[-0.5, 1.4, -8.8]} spread={1.8} c="#ffe2b8" power={0.32} island={SITE} sweep={0.24} speed={0.4} />
      <Beam p={[5.3, 6.3, -10.7]} to={[0.5, 1.4, -8.8]} spread={1.8} c="#fff0dc" power={0.32} island={SITE} sweep={0.24} speed={0.4} phase={2.4} />
      <Cyl p={[-5.3, 3.2, -10.7]} s={[0.07, 0.09, 6.4]} seg={8} c={P.charcoal} />
      <Cyl p={[5.3, 3.2, -10.7]} s={[0.07, 0.09, 6.4]} seg={8} c={P.charcoal} />

      {/* Fountain */}
      <Cyl p={[-10.4, 0.28, 8]} s={[1.9, 2, 0.56]} seg={32} c={P.stone} />
      <Cyl p={[-10.4, 0.55, 8]} s={[1.62, 1.62, 0.08]} seg={32} c={P.water} rough={0.2} emit={0.9} shadow={false} />
      <Cyl p={[-10.4, 0.95, 8]} s={[0.16, 0.24, 0.9]} seg={14} c={P.stone} />
      <Cyl p={[-10.4, 1.44, 8]} s={[0.55, 0.3, 0.12]} seg={24} c={P.stone} />

      <Inst g={geo.cyl(0.06, 0.08, 1, 8)} items={topiaryStems} />
      <Inst g={geo.ball(1, 18)} items={topiary} />

      <Figures items={figures} />
      <Trees items={trees} seed={19} />
      <Lamps items={lamps} />
      <Strings strands={strands} sag={0.9} gap={0.95} />
      <Pools items={pools} />
    </group>
  );
}
