import * as THREE from "three";
import { toScene, VENUES, type VenueKey } from "./venues";

export type V3 = [number, number, number];

/** Per-day accent colours. Used for light only: beacons, plinth rims, pins and card accents. */
export const DAY_COLORS = ["#ffb347", "#7aa7ff", "#5fd3a5", "#ff6fb1", "#ffd36b"];

export type SiteId = "hall" | "cinema" | "house" | "lounge" | "gala";

export type Site = {
  id: SiteId;
  venue: VenueKey;
  /** Where the model's centre sits, in metres, relative to the venue's map point (+Z faces the street). */
  offset: V3;
  /** Camera bearing around the model, radians. 0 looks at it from the street side. */
  azimuth: number;
  /** Warm lights that switch on as the camera arrives; positions are local to the model. */
  lights: { p: V3; color: string; power: number }[];
};

/** One model per day. Day 1 and Day 5 share DE Exchange: the hall on the street, the garden behind it. */
export const SITES: Site[] = [
  { id: "hall", venue: "deExchange", offset: [0, 0, 0], azimuth: 0.5, lights: [{ p: [4.5, 4, 5], color: "#ffc58a", power: 240 }, { p: [-6, 3.5, 6], color: "#ffb476", power: 140 }, { p: [0, 9, 9], color: "#ffe0b8", power: 90 }] },
  { id: "cinema", venue: "royalty", offset: [0, 0, 0], azimuth: -0.42, lights: [{ p: [1, 5, 1], color: "#a9c4ff", power: 200 }, { p: [-7, 3, 7], color: "#ffc58a", power: 130 }, { p: [9, 2.5, 3], color: "#7fe6dc", power: 100 }] },
  { id: "house", venue: "amalgamation", offset: [0, 0, 0], azimuth: 0.46, lights: [{ p: [-1, 4, 5], color: "#ffcb92", power: 240 }, { p: [-9, 3, 4], color: "#ffe2b8", power: 120 }, { p: [8, 2.5, 8], color: "#8fe6cf", power: 70 }] },
  { id: "lounge", venue: "blade", offset: [0, 0, 0], azimuth: -0.46, lights: [{ p: [0, 6, 5], color: "#ff7fbb", power: 220 }, { p: [-7, 3, 6], color: "#7fd9ff", power: 130 }, { p: [7, 3, 6], color: "#b99cff", power: 130 }] },
  { id: "gala", venue: "deExchange", offset: [10, 0, -46], azimuth: 0.36, lights: [{ p: [0, 5, 1], color: "#ffd49a", power: 280 }, { p: [0, 5, -7], color: "#ffd980", power: 160 }, { p: [-2, 2.5, 9], color: "#ffab85", power: 90 }] },
];

/** A model's centre on the map. */
export const siteCenter = (site: Site): V3 => toScene(site.venue, site.offset);
export const siteYaw = (site: Site) => VENUES[site.venue].yaw;
/** A point given in a model's own coordinates → map coordinates. */
export const siteLocal = (site: Site, p: V3): V3 => toScene(site.venue, [site.offset[0] + p[0], site.offset[1] + p[1], site.offset[2] + p[2]]);

/** Stops along the scroll: the overview of Eket, five days, then the finale. */
export const STOP_COUNT = SITES.length + 2;
export const LAST_STOP = STOP_COUNT - 1;

/** The middle of the mapped town, used to frame the wide shots. */
export const TOWN: V3 = [-1300, 0, 200];

/** The moon hangs low in the north, beyond the town. */
export const MOON_DIR = new THREE.Vector3(-0.13, 0.15, -1).normalize();

type Pose = { pos: THREE.Vector3; look: THREE.Vector3 };

/** Pushes the camera back on narrow screens, where the horizontal field of view shrinks. */
export function fitFor(aspect: number) {
  return THREE.MathUtils.clamp(1.02 / aspect, 1, 2.4);
}

/** A wider lens on tall screens, so a whole venue fits across a phone. */
export function fovFor(aspect: number) {
  return aspect >= 1 ? 32 : Math.min(46, 32 + (1 - aspect) * 26);
}

const v = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

function stopPose(i: number, fit: number): Pose {
  if (i === 0) {
    // Overview: all of Eket from the south, the horizon just in frame.
    const look = new THREE.Vector3(TOWN[0], 0, TOWN[2] + 100);
    return { pos: new THREE.Vector3(TOWN[0], 0, TOWN[2]).add(new THREE.Vector3(0, 1150, 3900).multiplyScalar(0.72 + 0.28 * fit)), look };
  }
  if (i === LAST_STOP) {
    // Finale: low over the lit town, looking north to the moon.
    return { pos: new THREE.Vector3(TOWN[0] + 300, 250, TOWN[2] + 2500 + 500 * fit), look: new THREE.Vector3(TOWN[0] - 250, 380, TOWN[2] - 2600) };
  }
  const site = SITES[i - 1];
  const radius = 47 * fit;
  const height = 16 * Math.pow(fit, 0.8);
  return {
    pos: v(siteLocal(site, [Math.sin(site.azimuth) * radius, height, Math.cos(site.azimuth) * radius])),
    look: v(siteLocal(site, [0, 5.2, 0])),
  };
}

/** Where the camera waits while the landing question is up: high over a dark town. */
export function landingPose(fit: number): Pose {
  return { pos: new THREE.Vector3(TOWN[0] + 1500, 3600 + 700 * fit, TOWN[2] + 5600 + 900 * fit), look: new THREE.Vector3(TOWN[0], 0, TOWN[2]) };
}

export type Path = { poses: Pose[]; lifts: number[] };

export function buildPath(fit: number): Path {
  const poses = Array.from({ length: STOP_COUNT }, (_, i) => stopPose(i, fit));
  // Each flight arcs upward: short hops rise a little, the trip to Ikot Abasi becomes a high glide.
  const lifts = poses.slice(0, -1).map((p, i) => Math.min(1400, 0.22 * p.pos.distanceTo(poses[i + 1].pos)));
  return { poses, lifts };
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Camera position and look target at a (fractional) stop. */
export function samplePath(path: Path, stop: number, pos: THREE.Vector3, look: THREE.Vector3) {
  const i = Math.min(Math.floor(stop), LAST_STOP - 1);
  const t = stop - i;
  const from = path.poses[i];
  const to = path.poses[i + 1];
  // Quadratic curve whose control point is lifted above the straight line between the two stops.
  _a.lerpVectors(from.pos, to.pos, 0.5);
  _a.y += path.lifts[i];
  _b.lerpVectors(from.pos, _a, t);
  pos.lerpVectors(_a, to.pos, t);
  pos.lerpVectors(_b, pos, t);
  look.lerpVectors(from.look, to.look, THREE.MathUtils.smootherstep(t, 0, 1));
}

/**
 * How far the picture is shifted so the venue sits clear of the text.
 * x is a share of the width (negative moves the venue right), y a share of the height
 * (positive moves it up). Wide screens put the card on the left; tall ones at the bottom.
 */
export function viewShift(stop: number, aspect: number) {
  const day = THREE.MathUtils.smoothstep(stop, 0, 1) * (1 - THREE.MathUtils.smoothstep(stop, LAST_STOP - 1, LAST_STOP));
  if (aspect >= 1.05) return { x: -0.16 * day, y: 0 };
  return { x: 0, y: 0.18 * day };
}

/** Holds the camera still around each stop, then eases through the flight between two stops. */
export function dwell(stop: number) {
  const i = Math.floor(stop);
  const f = stop - i;
  return i + THREE.MathUtils.smootherstep(f, 0.14, 0.86);
}
