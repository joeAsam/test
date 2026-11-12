import type { CityData } from "./city";
import { SITES, siteCenter } from "./journey";

/** A leg of the week's route: a line along real roads from one day's venue to the next, as [x, z, x, z, …]. */
export type Leg = number[];

type Edge = { to: number; cost: number };

/** Main roads are cheaper to travel, so routes prefer them the way a driver would. */
const RANK_DISCOUNT = [1, 0.85, 0.7, 0.6];

class Heap {
  private items: [number, number][] = [];
  get size() {
    return this.items.length;
  }
  push(cost: number, node: number) {
    const a = this.items;
    a.push([cost, node]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Finds the road route between each pair of consecutive venues.
 * Roads that share a point (to the nearest metre) are treated as joined there.
 */
export function buildLegs(city: CityData): Leg[] {
  const index = new Map<string, number>();
  const xs: number[] = [];
  const zs: number[] = [];
  const edges: Edge[][] = [];
  /** Which road first created each point, so a road is never "joined" to itself. */
  const owner: number[] = [];
  let building = -1;
  const nodeAt = (x: number, z: number) => {
    const key = `${Math.round(x)},${Math.round(z)}`;
    let n = index.get(key);
    if (n === undefined) {
      n = xs.length;
      index.set(key, n);
      xs.push(x);
      zs.push(z);
      edges.push([]);
      owner.push(building);
    }
    return n;
  };
  const join = (a: number, b: number, discount: number) => {
    if (a === b) return;
    const cost = Math.hypot(xs[a] - xs[b], zs[a] - zs[b]) * discount;
    edges[a].push({ to: b, cost });
    edges[b].push({ to: a, cost });
  };
  const nearest = (x: number, z: number, skipRoad = -2) => {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < xs.length; i++) {
      if (owner[i] === skipRoad || !edges[i].length) continue;
      const d = (xs[i] - x) ** 2 + (zs[i] - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const loose: number[] = [];
  city.roads.forEach((road, id) => {
    building = id;
    const p = road.p;
    let prev = -1;
    for (let i = 0; i < p.length; i += 2) {
      const n = nodeAt(p[i], p[i + 1]);
      if (prev >= 0) join(prev, n, RANK_DISCOUNT[road.r] ?? 1);
      prev = n;
    }
    // The inter-town expressway is drawn in by hand and does not quite touch the mapped streets.
    if (road.r === 3 && p.length > 80) loose.push(nodeAt(p[0], p[1]), nodeAt(p[p.length - 2], p[p.length - 1]));
  });
  for (const n of loose) {
    if (edges[n].length > 1) continue;
    const other = nearest(xs[n], zs[n], owner[n]);
    if (other >= 0) join(n, other, 0.6);
  }

  const route = (from: number, to: number): number[] | null => {
    const dist = new Float64Array(xs.length).fill(Infinity);
    const prev = new Int32Array(xs.length).fill(-1);
    const heap = new Heap();
    dist[from] = 0;
    heap.push(0, from);
    while (heap.size) {
      const [d, n] = heap.pop();
      if (n === to) break;
      if (d > dist[n]) continue;
      for (const e of edges[n]) {
        const nd = d + e.cost;
        if (nd < dist[e.to]) {
          dist[e.to] = nd;
          prev[e.to] = n;
          heap.push(nd, e.to);
        }
      }
    }
    if (dist[to] === Infinity) return null;
    const out: number[] = [];
    for (let n = to; n >= 0; n = prev[n]) out.push(zs[n], xs[n]);
    return out.reverse();
  };

  const legs: Leg[] = [];
  for (let i = 0; i < SITES.length - 1; i++) {
    const a = siteCenter(SITES[i]);
    const b = siteCenter(SITES[i + 1]);
    const path = route(nearest(a[0], a[2]), nearest(b[0], b[2]));
    // Each leg starts and ends at the venue itself; with no road link, it falls back to a straight line.
    legs.push([a[0], a[2], ...(path ?? []), b[0], b[2]]);
  }
  return legs;
}

/**
 * A camera track along one or more consecutive legs: points every few metres along the
 * route, softened so the camera glides past corners instead of snapping round them.
 */
export type Track = {
  /** Smoothed x, z every STEP metres of route. */
  xs: Float32Array;
  zs: Float32Array;
  /** Route length in metres. */
  total: number;
  /** Where each leg starts along the track, and how long it is, in metres. */
  starts: number[];
  lengths: number[];
};

const STEP = 15;
/** Points either side averaged together; 10 × 15 m softens anything tighter than about 300 m. */
const SOFTEN = 10;

export function buildTrack(legs: Leg[]): Track {
  const raw: number[] = [];
  const starts: number[] = [];
  const lengths: number[] = [];
  let total = 0;
  for (const leg of legs) {
    starts.push(total);
    let len = 0;
    for (let i = 2; i < leg.length; i += 2) len += Math.hypot(leg[i] - leg[i - 2], leg[i + 1] - leg[i - 1]);
    lengths.push(len);
    total += len;
    for (let i = 0; i < leg.length; i++) raw.push(leg[i]);
  }
  // Resample the joined polyline every STEP metres.
  const n = Math.max(2, Math.ceil(total / STEP) + 1);
  const px = new Float32Array(n);
  const pz = new Float32Array(n);
  let seg = 0;
  let segStart = 0;
  let segLen = Math.hypot(raw[2] - raw[0], raw[3] - raw[1]);
  for (let k = 0; k < n; k++) {
    const s = Math.min(total, k * STEP);
    while (segStart + segLen < s && seg + 2 < raw.length / 2 - 1) {
      segStart += segLen;
      seg++;
      segLen = Math.hypot(raw[2 * seg + 2] - raw[2 * seg], raw[2 * seg + 3] - raw[2 * seg + 1]);
    }
    const f = segLen > 0 ? Math.min(1, (s - segStart) / segLen) : 0;
    px[k] = raw[2 * seg] + (raw[2 * seg + 2] - raw[2 * seg]) * f;
    pz[k] = raw[2 * seg + 1] + (raw[2 * seg + 3] - raw[2 * seg + 1]) * f;
  }
  const xs = new Float32Array(n);
  const zs = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let sx = 0;
    let sz = 0;
    let c = 0;
    for (let j = Math.max(0, k - SOFTEN); j <= Math.min(n - 1, k + SOFTEN); j++) {
      sx += px[j];
      sz += pz[j];
      c++;
    }
    xs[k] = sx / c;
    zs[k] = sz / c;
  }
  // The ends stay exactly on the venues.
  xs[0] = px[0];
  zs[0] = pz[0];
  xs[n - 1] = px[n - 1];
  zs[n - 1] = pz[n - 1];
  return { xs, zs, total, starts, lengths };
}

/** The point `s` metres along a track. */
export function trackAt(track: Track, s: number, out: { x: number; z: number }) {
  const f = Math.min(track.xs.length - 1, Math.max(0, s / STEP));
  const i = Math.min(track.xs.length - 2, Math.floor(f));
  const t = f - i;
  out.x = track.xs[i] + (track.xs[i + 1] - track.xs[i]) * t;
  out.z = track.zs[i] + (track.zs[i + 1] - track.zs[i]) * t;
  return out;
}
