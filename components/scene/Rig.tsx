"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { LAST_STOP, SITES, TOWN, buildPath, fitFor, fovFor, isDay, landingPose, siteCenter, siteLocal } from "@/lib/journey";
import { buildTrack, trackAt, type Track } from "@/lib/route";
import { FULL_REACH, INTRO_SECONDS, world } from "@/lib/world";
import { FOG_DENSITY } from "./Map";

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (x: number, a: number, b: number) => THREE.MathUtils.smoothstep(x, a, b);

/** Intro beats, in seconds after the visitor says yes. */
const SPREAD_FROM = 0.8;
const SPREAD_FOR = 5.2;
const BEACONS_FROM = 6.1;
const BEACON_GAP = 0.55;
const CAMERA_FOR = 9.4;

/** A flight climbs to a view of both places (until RISE), hangs there while the route draws, then descends (from FALL). */
const RISE = 0.38;
const FALL = 0.62;
/** Following the route: seconds to climb, seconds to come down, and the camera's angle above the route. */
const CLIMB = 1.9;
const DESCEND = 2.3;
const CHASE_ANGLE = 0.88;
/** Elevation of the camera in that overhead view, radians. */
const OVERHEAD_ANGLE = 0.98;

/** Idle drift: after this long without input the camera starts to turn on its own (ms). */
const IDLE_AFTER = 500;
/** …easing up over this long (ms) to this speed (radians a second). */
const IDLE_RAMP = 1600;
const IDLE_SPEED = 0.014;

/** How low and how high the visitor may tilt, as the camera's angle above the ground (radians). */
const TILT_MIN = 0.07;
const TILT_MAX = 1.32;
/** How far the visitor may zoom: closer to the building, or further back. */
export const ZOOM_RANGE: [number, number] = [0.3, 1.7];

const UP = new THREE.Vector3(0, 1, 0);
const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _side = new THREE.Vector3();
const head = { x: 0, z: 0 };

/** The point on the ground a stop is about: its venue, or the town for the wide shots. */
function groundOf(stop: number, out: THREE.Vector3) {
  const p = isDay(stop) ? siteCenter(SITES[stop - 1]) : TOWN;
  return out.set(p[0], 0, p[2]);
}

/**
 * Drives the camera and everything tied to it: the intro, the flights between stops,
 * the look-around and idle drift, each venue's focus, the route being drawn, the fog,
 * the pooled warm lights, the shadow light, the text cards and the map pins.
 */
export function Rig({ shadows, mapSize }: { shadows: boolean; mapSize: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const aspect = size.width / size.height;
  // Rebuild the stops only when the screen shape changes enough to matter.
  const fit = Math.round(fitFor(aspect) * 20) / 20;
  const path = useMemo(() => buildPath(fit), [fit]);
  const landing = useMemo(() => landingPose(fit), [fit]);
  const centres = useMemo(() => SITES.map((s) => siteCenter(s)), []);

  const moon = useRef<THREE.DirectionalLight>(null);
  const warm = useRef<(THREE.PointLight | null)[]>([]);
  // The flight in progress: where it took off, the overhead view it passes through, and how long it lasts.
  const leg = useRef({
    pos: new THREE.Vector3(),
    look: new THREE.Vector3(),
    overPos: new THREE.Vector3(),
    overLook: new THREE.Vector3(),
    overhead: false,
    /** Set when the camera travels with the route line from one day to a later one. */
    track: null as Track | null,
    /** Where the camera sits relative to the head of the line while following it. */
    chase: new THREE.Vector3(),
    /** Seconds spent following the line. */
    follow: 0,
    seconds: 1,
    started: false,
  });
  const orbit = useRef({ yaw: 0, pitch: 0, zoom: 1 });
  const shown = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3() });

  useFrame(({ clock }, dt) => {
    const step = Math.min(dt, 0.05);
    const flight = world.flight;
    const L = leg.current;

    if (!L.started) {
      L.started = true;
      shown.current.pos.copy(path.poses[0].pos);
      shown.current.look.copy(path.poses[0].look);
    }

    // A new request: take off from wherever the camera is right now.
    if (world.journey && world.target !== flight.to) {
      flight.from = flight.to;
      flight.to = world.target;
      L.pos.copy(shown.current.pos);
      L.look.copy(shown.current.look);
      // The overhead view frames both places, side-on to the direction of travel.
      const a = groundOf(flight.from, new THREE.Vector3());
      const b = groundOf(flight.to, new THREE.Vector3());
      const span = a.distanceTo(b);
      L.overhead = span > 120;
      L.track = null;
      // Onward from one day to a later one: travel with the route line along the roads.
      const onward = isDay(flight.from) && isDay(flight.to) && flight.to > flight.from && world.routes && span > 120;
      if (onward && world.routes) {
        L.track = buildTrack(world.routes.slice(flight.from - 1, flight.to - 1));
        // Behind and to the south of the direction of travel, looking down at the head of the line.
        _side.subVectors(b, a).setY(0).normalize();
        const back = _side.clone().negate();
        _side.set(-_side.z, 0, _side.x);
        if (_side.z < 0) _side.negate();
        const dir = back.multiplyScalar(0.45).addScaledVector(_side, 0.9).normalize();
        const distance = THREE.MathUtils.clamp(span * 0.42 * fit, 280, 2600);
        L.chase.copy(dir).multiplyScalar(Math.cos(CHASE_ANGLE) * distance).addScaledVector(UP, Math.sin(CHASE_ANGLE) * distance);
        // The line, and the camera with it, travels at a steady, unhurried pace.
        L.follow = THREE.MathUtils.clamp(2.6 + L.track.total / 1100, 3.4, 10);
        L.seconds = CLIMB + L.follow + DESCEND;
      } else if (L.overhead) {
        L.overLook.lerpVectors(a, b, 0.5);
        _side.subVectors(b, a).setY(0).normalize();
        _side.set(-_side.z, 0, _side.x);
        if (_side.z < 0) _side.negate(); // look from the south, toward the moon
        const distance = Math.max(420, span * 1.3 * fit);
        L.overPos.copy(L.overLook).addScaledVector(_side, Math.cos(OVERHEAD_ANGLE) * distance).addScaledVector(UP, Math.sin(OVERHEAD_ANGLE) * distance);
        L.seconds = THREE.MathUtils.clamp(3.4 + distance / 3200, 3.8, 6.4);
      } else {
        L.seconds = 2.2;
      }
      flight.t = world.snap || world.reduced ? 1 : 0;
      world.snap = false;
      // The flight starts from the turned view, so the turn itself is handed over to it.
      world.orbit.yaw = orbit.current.yaw = 0;
      world.orbit.pitch = orbit.current.pitch = 0;
      world.orbit.zoom = orbit.current.zoom = 1;
    }
    if (flight.t < 1) flight.t = Math.min(1, flight.t + step / L.seconds);
    /** How far along the route the line has drawn, 0 to 1, at a moment u seconds into the flight. */
    const along = (u: number) => {
      const x = clamp01((u - CLIMB) / L.follow);
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    };
    const t = flight.t;
    const resting = t >= 1;

    // Up to the overhead view, a slow creep while the route draws, then down to the next stop.
    const to = path.poses[flight.to];
    if (resting) {
      _pos.copy(to.pos);
      _look.copy(to.look);
    } else if (L.track) {
      // Climb above the start of the route, travel with the head of the line, then descend.
      const u = t * L.seconds;
      if (u < CLIMB) {
        const e = ease(u / CLIMB);
        trackAt(L.track, 0, head);
        _v.set(head.x, 0, head.z);
        _pos.lerpVectors(L.pos, _v.clone().add(L.chase), e);
        _look.lerpVectors(L.look, _v, e);
      } else if (u < CLIMB + L.follow) {
        trackAt(L.track, L.track.total * along(u), head);
        _look.set(head.x, 0, head.z);
        _pos.copy(_look).add(L.chase);
      } else {
        const e = ease((u - CLIMB - L.follow) / DESCEND);
        trackAt(L.track, L.track.total, head);
        _v.set(head.x, 0, head.z);
        _pos.lerpVectors(_v.clone().add(L.chase), to.pos, e);
        _look.lerpVectors(_v, to.look, e);
      }
    } else if (L.overhead) {
      if (t < RISE) {
        const e = ease(t / RISE);
        _pos.lerpVectors(L.pos, L.overPos, e);
        _look.lerpVectors(L.look, L.overLook, e);
      } else if (t < FALL) {
        const h = (t - RISE) / (FALL - RISE);
        _pos.lerpVectors(L.overPos, L.overLook, 0.05 * h);
        _look.copy(L.overLook);
      } else {
        const e = ease((t - FALL) / (1 - FALL));
        _v.lerpVectors(L.overPos, L.overLook, 0.05);
        _pos.lerpVectors(_v, to.pos, e);
        _look.lerpVectors(L.overLook, to.look, e);
      }
    } else {
      const e = ease(t);
      _pos.lerpVectors(L.pos, to.pos, e);
      _pos.y += Math.sin(e * Math.PI) * 30;
      _look.lerpVectors(L.look, to.look, e);
    }

    // Intro: the light spreads through the streets, the beacons ignite, the camera comes down.
    let introK = 1;
    if (world.journey) {
      world.reach = FULL_REACH;
      world.beacon.fill(1);
    } else {
      if (world.introT >= 0) world.introT += step;
      const it = world.introT;
      world.reach = it < SPREAD_FROM ? 0 : FULL_REACH * Math.pow(clamp01((it - SPREAD_FROM) / SPREAD_FOR), 1.7);
      for (let i = 0; i < SITES.length; i++) world.beacon[i] = smooth(it, BEACONS_FROM + i * BEACON_GAP, BEACONS_FROM + i * BEACON_GAP + 0.8);
      introK = it < 0 ? 0 : ease(clamp01(it / CAMERA_FOR));
      _pos.lerpVectors(landing.pos, _pos, introK);
      _look.lerpVectors(landing.look, _look, introK);
      if (it >= INTRO_SECONDS) world.journey = true;
    }

    // How present each stop is: the one being left fades early, the one arriving fades in late.
    const arrive = L.track ? (CLIMB + L.follow + DESCEND * 0.45) / L.seconds : 0.8;
    const presence = (stop: number) => {
      if (resting) return stop === flight.to ? 1 : 0;
      if (stop === flight.to) return smooth(t, arrive, 0.99);
      if (stop === flight.from) return 1 - smooth(t, 0.02, 0.22);
      return 0;
    };
    for (let i = 0; i < SITES.length; i++) world.focus[i] = presence(i + 1);
    const overview = presence(0);
    world.wide = Math.max(overview, presence(LAST_STOP));

    // The route between venues. Flying on to a later day draws the legs between, while the
    // camera hangs over them; the wide shots show the whole week's route.
    const drawn = L.track ? along(t * L.seconds) : L.overhead ? smooth(t, RISE - 0.06, FALL + 0.04) : t;
    const forward = !resting && isDay(flight.from) && isDay(flight.to) && flight.to > flight.from;
    for (let k = 0; k < world.legs.length; k++) {
      const between = forward && k >= flight.from - 1 && k <= flight.to - 2;
      if (between && L.track) {
        // Each leg fills in turn as the head of the line passes along it.
        const i = k - (flight.from - 1);
        world.legs[k] = clamp01((drawn * L.track.total - L.track.starts[i]) / Math.max(1, L.track.lengths[i]));
      } else if (between) world.legs[k] = drawn;
      else {
        const whole = !isDay(flight.to) || k + 2 <= flight.to;
        world.legs[k] += ((world.journey && whole ? 1 : 0) - world.legs[k]) * Math.min(1, step * (world.reduced ? 60 : 2.2));
      }
    }
    world.legActive = isDay(flight.to) ? flight.to - 2 : -1;

    // Look-around and idle drift at a stop: the camera turns and tilts about what it faces.
    const now = performance.now();
    const canTurn = resting && world.journey && flight.to !== LAST_STOP;
    if (canTurn && !world.reduced) {
      const idle = now - world.lastInput - IDLE_AFTER;
      if (idle > 0) world.orbit.yaw += step * IDLE_SPEED * smooth(idle, 0, IDLE_RAMP);
    }
    const o = orbit.current;
    _v.subVectors(_pos, _look);
    const baseTilt = Math.asin(THREE.MathUtils.clamp(_v.y / _v.length(), -1, 1));
    world.orbit.pitch = THREE.MathUtils.clamp(world.orbit.pitch, TILT_MIN - baseTilt, TILT_MAX - baseTilt);
    const follow = Math.min(1, step * 9);
    o.yaw += (world.orbit.yaw - o.yaw) * follow;
    o.pitch += (world.orbit.pitch - o.pitch) * follow;
    world.orbit.zoom = THREE.MathUtils.clamp(world.orbit.zoom, ZOOM_RANGE[0], ZOOM_RANGE[1]);
    o.zoom += (world.orbit.zoom - o.zoom) * follow;
    if (canTurn && (o.yaw !== 0 || o.pitch !== 0 || o.zoom !== 1)) {
      _axis.crossVectors(UP, _v).normalize();
      _v.applyAxisAngle(_axis, -o.pitch).applyAxisAngle(UP, o.yaw).multiplyScalar(o.zoom);
      _pos.copy(_look).add(_v);
    }
    // The finale has no building to turn around: its view drifts gently across the sky instead.
    if (resting && flight.to === LAST_STOP && world.journey && !world.reduced) {
      const idle = smooth(now - world.lastInput - IDLE_AFTER, 0, IDLE_RAMP);
      _v.subVectors(_look, _pos).applyAxisAngle(UP, Math.sin(clock.elapsedTime * 0.07) * 0.08 * idle);
      _look.copy(_pos).add(_v);
    }

    shown.current.pos.copy(_pos);
    shown.current.look.copy(_look);
    camera.position.copy(_pos);
    camera.lookAt(_look);
    camera.fov = fovFor(aspect); // applied by setViewOffset below

    // Thin the fog as the camera climbs, so the far end of a long route stays visible.
    world.fogDensity = FOG_DENSITY * Math.min(1, 4500 / Math.max(1, _pos.distanceTo(_look)));
    if (scene.fog instanceof THREE.FogExp2) scene.fog.density = world.fogDensity;

    // Shift the picture so a venue sits beside (or above) its text card.
    const day = resting ? (isDay(flight.to) ? 1 : 0) : Math.max(isDay(flight.to) ? smooth(t, L.track ? arrive - 0.08 : 0.65, 1) : 0, isDay(flight.from) ? 1 - smooth(t, 0, L.track ? CLIMB / L.seconds : 0.3) : 0);
    const shiftX = aspect >= 1.05 ? -0.16 * day : 0;
    const shiftY = aspect >= 1.05 ? 0 : 0.18 * day;
    camera.setViewOffset(size.width, size.height, shiftX * size.width * introK, shiftY * size.height * introK, size.width, size.height);

    // The three warm lights belong to the venue in view and are dark mid-flight,
    // so they can jump to the next venue unseen.
    const nearer = t < 0.5 ? flight.from : flight.to;
    const active = THREE.MathUtils.clamp(nearer - 1, 0, SITES.length - 1);
    const site = SITES[active];
    const lit = smooth(world.focus[active], 0.5, 0.92);
    warm.current.forEach((light, i) => {
      const spec = site.lights[i];
      if (!light || !spec) return;
      const p = siteLocal(site, spec.p);
      light.position.set(p[0], p[1], p[2]);
      light.color.set(spec.color);
      light.intensity = spec.power * 0.3 * lit;
    });

    // The moonlight's shadow box follows whatever the camera is looking at.
    const m = moon.current;
    if (m) {
      m.target.position.copy(_look).setY(0);
      m.target.updateMatrixWorld();
      m.position.set(_look.x - 34, 62, _look.z + 26);
    }

    // Text cards fade and drift in step with the flight.
    for (let i = 0; i <= LAST_STOP; i++) {
      const el = world.cards[i];
      if (!el) continue;
      const p = presence(i);
      const arriving = i === flight.to;
      el.style.opacity = p.toFixed(3);
      el.style.transform = `translate3d(0, ${((1 - p) * (arriving ? 22 : -22)).toFixed(1)}px, 0)`;
      el.style.visibility = p < 0.01 ? "hidden" : "visible";
      el.style.pointerEvents = p > 0.6 ? "auto" : "none";
    }

    // Map pins: shown on the overview, pinned to the screen edge when their venue is out of frame.
    camera.updateMatrixWorld();
    for (let i = 0; i < SITES.length; i++) {
      const el = world.pins[i];
      if (!el) continue;
      const visible = overview * world.beacon[i];
      if (visible < 0.02) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        continue;
      }
      _v.set(centres[i][0], 0, centres[i][2]).project(camera);
      const behind = _v.z > 1;
      const mx = Math.min(140, size.width * 0.2);
      let x = (_v.x * 0.5 + 0.5) * size.width;
      const y = (-_v.y * 0.5 + 0.5) * size.height;
      if (behind) x = _v.x > 0 ? -1 : size.width + 1;
      const cx = THREE.MathUtils.clamp(x, mx, size.width - mx);
      const edge = cx !== x;
      // Edge pins wait in the middle band, clear of the title above and the footer below.
      // On a tall screen the title fills the top half, so pins keep to the lower half.
      const top = aspect < 1 ? size.height * 0.5 : 190;
      const cy = edge ? THREE.MathUtils.clamp(y, size.height * 0.5, size.height * 0.72) : THREE.MathUtils.clamp(y, top, size.height - 120);
      el.dataset.edge = edge ? (x < cx ? "left" : "right") : "";
      el.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      el.style.opacity = visible.toFixed(3);
      el.style.pointerEvents = visible > 0.6 && world.journey ? "auto" : "none";
    }
  });

  return (
    <>
      <hemisphereLight args={["#8a9cff", "#2b2450", 1.05]} />
      <directionalLight
        ref={moon}
        color="#c6d2ff"
        intensity={2.1}
        castShadow={shadows}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-bias={-0.0012}
        shadow-normalBias={0.14}
        shadow-radius={5}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-near={1}
        shadow-camera-far={160}
      />
      {[0, 1, 2].map((i) => (
        <pointLight
          key={i}
          ref={(node) => {
            warm.current[i] = node;
          }}
          distance={38}
          decay={1.6}
          intensity={0}
        />
      ))}
    </>
  );
}
