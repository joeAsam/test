"use client";

import type { V3 } from "@/lib/journey";
import { DAY_COLORS } from "@/lib/journey";
import { Ball, Box, Cone, Cyl, Figures, Inst, Lamps, Palms, Plinth, Pools, Roof, Strings, faceTo, geo, seeded, type Figure, type Item, type Pool } from "../kit";
import { P } from "./palette";

const rand = seeded(73);

/** Six columns on each of the two veranda levels. */
const columns: Item[] = [];
for (let i = 0; i < 6; i++) {
  const x = -8.6 + i * 2.24;
  columns.push({ p: [x, 1.75, -0.5], s: [1, 3, 1], c: P.stone }, { p: [x, 4.85, -0.5], s: [1, 2.9, 1], c: P.stone });
}

const windows: Item[] = [];
const shutters: Item[] = [];
const addWindow = (x: number, y: number) => {
  windows.push({ p: [x, y, -1.72], s: [0.95, 1.5, 1], c: rand() > 0.2 ? P.glass : P.glassDeep });
  shutters.push({ p: [x - 0.68, y, -1.7], s: [0.3, 1.5, 0.06], c: "#234a3c" }, { p: [x + 0.68, y, -1.7], s: [0.3, 1.5, 0.06], c: "#234a3c" });
};
[-7.5, -5.3, -0.7, 1.5].forEach((x) => addWindow(x, 1.75));
[-7.5, -5.3, -3, -0.7, 1.5].forEach((x) => addWindow(x, 4.9));

const guide: V3 = [-1.2, 0, 3.4];
const figures: Figure[] = [{ p: guide, face: 0.2 }];
for (let i = 0; i < 8; i++) {
  const a = -0.5 + (i / 7) * 3.2;
  const d = 2.4 + (i % 3) * 0.85;
  const p: V3 = [guide[0] + Math.sin(a) * d * 1.2, 0, guide[2] + 1.2 + Math.cos(a) * d * 0.75];
  figures.push({ p, face: faceTo(p, guide), h: 0.92 + rand() * 0.12 });
}
figures.push({ p: [-9, 0, 9.4], face: 0.6 }, { p: [-3, 3.45, -0.9], face: 0, h: 0.95 }, { p: [3.6, 0.45, 8.4], face: 1.2 });

const palms = [
  { p: [12.2, 0, 1.2] as V3, lean: 0.2 },
  { p: [-12.4, 0, -0.6] as V3, s: 1.1, lean: -0.18 },
  { p: [-4.4, 0, 12] as V3, s: 0.9, lean: -0.12 },
  { p: [11.8, 0, -7.4] as V3, s: 0.95, lean: 0.1 },
  { p: [-11, 0, -7.6] as V3, lean: -0.08 },
];
const lamps = [{ p: [-6.2, 0, 2.4] as V3, h: 3 }, { p: [1.6, 0, 1.6] as V3, h: 3 }];
const strands: [V3, V3][] = [
  [[-9.2, 6.2, -0.3], [-6.2, 3.2, 2.4]],
  [[3.2, 6.2, -0.3], [1.6, 3.2, 1.6]],
  [[-6.2, 3.2, 2.4], [1.6, 3.2, 1.6]],
];
const wheels: Item[] = [
  [-10.4, 3.7], [-7.6, 3.7], [-10.4, 7.5], [-7.6, 7.5],
].map(([x, z]) => ({ p: [x, 0.48, z] as V3, r: [0, 0, Math.PI / 2] as V3, c: P.charcoal }));
const pools: Pool[] = [
  { p: [-3, 0.12, 2], r: 7.5, c: "#ffc98a", o: 0.45 },
  { p: [7.2, 0.22, 7.6], r: 7, c: "#3fd6dc", o: 0.3 },
  { p: [-9, 0.12, 10.8], r: 3.2, c: "#fff0d0", o: 0.5 },
];

/** Day 3: Amalgamation House, Ikot Abasi. The two-storey colonial house on the bend of the Imo River. */
export function House() {
  return (
    <group>
      <Plinth color={DAY_COLORS[2]} />

      {/* House */}
      <Box p={[-3, 3.2, -5]} s={[12, 6.4, 6.5]} c={P.stone} />
      <Roof p={[-3, 7.9, -4.4]} s={[14, 3, 9]} c={P.terracotta} />
      <Box p={[-3, 0.15, -1.1]} s={[12.6, 0.3, 2]} c={P.stoneWarm} />
      <Box p={[-3, 3.3, -1.2]} s={[12.6, 0.2, 1.8]} c={P.stoneWarm} />
      <Box p={[-3, 3.95, -0.42]} s={[12.2, 0.08, 0.08]} round={0.02} c={P.stone} />
      <Inst g={geo.cyl(0.15, 0.17, 1, 14)} items={columns} />
      <Inst g={geo.plane()} items={windows} glow={1.4} />
      <Inst g={geo.box(1, 1, 1, 0.02)} items={shutters} />
      <Box p={[-3, 1.5, -1.7]} s={[1.4, 2.4, 0.1]} c={P.timber} />
      <Box p={[-3, 0.07, 3.2]} s={[2.3, 0.06, 6.6]} round={0.02} c={P.pavingLight} />

      {/* Memorial obelisk and flag */}
      <Box p={[6.6, 0.3, -2.2]} s={[1.9, 0.6, 1.9]} c={P.concrete} />
      <Cyl p={[6.6, 2.8, -2.2]} s={[0.26, 0.56, 4.4]} seg={4} r={[0, Math.PI / 4, 0]} c={P.stone} />
      <Cone p={[6.6, 5.3, -2.2]} s={[0.37, 0.6]} seg={4} r={[0, Math.PI / 4, 0]} c={P.stone} />
      <Cyl p={[9.4, 3.3, -4.6]} s={[0.05, 0.07, 6.6]} seg={8} c={P.concrete} />
      <Box p={[9.75, 5.9, -4.6]} s={[0.62, 1.2, 0.04]} round={0.01} c="#12773f" />
      <Box p={[10.37, 5.9, -4.6]} s={[0.62, 1.2, 0.04]} round={0.01} c="#f2efe8" />
      <Box p={[10.99, 5.9, -4.6]} s={[0.62, 1.2, 0.04]} round={0.01} c="#12773f" />

      {/* River bend, jetty and canoe */}
      <Cyl p={[7.2, 0.07, 7.6]} s={[5.9, 5.9, 0.06]} seg={56} scale={[1.22, 1, 0.82]} c={P.stoneWarm} />
      <Cyl p={[7.2, 0.11, 7.6]} s={[5.5, 5.5, 0.06]} seg={56} scale={[1.22, 1, 0.82]} c="#127f96" rough={0.15} emit={0.55} shadow={false} />
      <Box p={[3.4, 0.36, 8.4]} s={[3.4, 0.14, 1.2]} c={P.timber} />
      <Ball p={[8.9, 0.3, 8.3]} s={1} scale={[1.7, 0.28, 0.5]} c={P.timber} />

      {/* Tour coach */}
      <Box p={[-9, 1.5, 5.6]} s={[2.6, 2.2, 5.8]} round={0.3} c={P.stone} />
      <Box p={[-9, 1.95, 5.6]} s={[2.64, 0.75, 5]} round={0.12} c="#ffd9a8" glow={0.9} />
      <Box p={[-9, 0.72, 5.6]} s={[2.62, 0.3, 5.82]} round={0.1} c={P.charcoal} />
      <Inst g={geo.cyl(0.48, 0.48, 0.3, 18)} items={wheels} />
      <Ball p={[-9.75, 1, 8.5]} s={0.16} c="#fff0d0" glow={3.2} />
      <Ball p={[-8.25, 1, 8.5]} s={0.16} c="#fff0d0" glow={3.2} />

      <Figures items={figures} />
      <Palms items={palms} seed={15} />
      <Lamps items={lamps} />
      <Strings strands={strands} />
      <Pools items={pools} />
    </group>
  );
}
