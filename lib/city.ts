/**
 * Map loader. public/data/map.json is built from OpenStreetMap by scripts/build-map.py.
 * Roads: { n?: name, r: rank 0..3, p: [x0,z0,…] }  Buildings: { p: closed ring, h }
 * Rivers: { n?, w: width, p } Areas: closed water rings.
 * Eket is already in scene metres; the Ikot Abasi cluster is shifted to IKOT_OFFSET,
 * and a link road ("to Ikot Abasi, ≈45 km") joins the two.
 */
import { IKOT_OFFSET } from "./venues";

export type Road = { n?: string | null; r: number; p: number[] };
export type Building = { p: number[]; h?: number | null };
export type River = { n?: string | null; w: number; p: number[] };
export type CityData = { roads: Road[]; buildings: Building[]; rivers: River[]; areas: number[][] };

const shift = (p: number[]) => p.map((v, i) => v + (i % 2 === 0 ? IKOT_OFFSET[0] : IKOT_OFFSET[1]));

/** Gently curving expressway from Eket's western edge to the Ikot Abasi cluster. */
function linkRoad(): Road {
  const a: [number, number] = [-3700, 760];
  const b: [number, number] = [IKOT_OFFSET[0] + 1650, IKOT_OFFSET[1] - 420];
  const p: number[] = [];
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bend = Math.sin(t * Math.PI) * 420 + Math.sin(t * Math.PI * 3) * 60;
    p.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + bend);
  }
  return { n: "Eket–Ikot Abasi Road", r: 3, p };
}

let cached: Promise<CityData> | null = null;

export function loadCity(): Promise<CityData> {
  cached ??= fetch("/data/map.json")
    .then((r) => r.json())
    .then((m) => {
      const e = m.eket;
      const k = m.ikot;
      return {
        roads: [...e.roads, ...k.roads.map((r: Road) => ({ ...r, p: shift(r.p) })), linkRoad()],
        buildings: [...e.buildings, ...k.buildings.map((b: Building) => ({ ...b, p: shift(b.p) }))],
        rivers: [...e.rivers, ...k.rivers.map((r: River) => ({ ...r, p: shift(r.p) }))],
        areas: [...e.areas, ...k.areas.map(shift)],
      } as CityData;
    });
  return cached;
}

/** Street / river names shown as map labels (on the overview and on the excursion). */
export const LABELLED: [string, string][] = [
  ["Gracebill Road", "Gracebill Road"],
  ["F103", "Eket–Oron Road (F103)"],
  ["Qua Iboe River", "Qua Iboe River"],
  ["Eket–Ikot Abasi Road", "To Ikot Abasi · ≈ 45 km"],
  ["Imo River", "Imo River"],
];
