"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { LAST_STOP, SITES, buildPath, fitFor, fovFor, isDay, landingPose, siteCenter, siteLocal } from "@/lib/journey";
import { FULL_REACH, INTRO_SECONDS, world } from "@/lib/world";

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (x: number, a: number, b: number) => THREE.MathUtils.smoothstep(x, a, b);

/** Intro beats, in seconds after the visitor says yes. */
const SPREAD_FROM = 0.8;
const SPREAD_FOR = 5.2;
const BEACONS_FROM = 6.1;
const BEACON_GAP = 0.55;
const CAMERA_FOR = 9.4;

const UP = new THREE.Vector3(0, 1, 0);
const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _a = new THREE.Vector3();
const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();

/**
 * Drives the camera and everything tied to it: the intro, the timed flights between
 * stops, the look-around on the overview, each venue's focus, the route being drawn,
 * the pooled warm lights, the shadow light, the text cards and the map pins.
 */
export function Rig({ shadows, mapSize }: { shadows: boolean; mapSize: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const aspect = size.width / size.height;
  // Rebuild the stops only when the screen shape changes enough to matter.
  const fit = Math.round(fitFor(aspect) * 20) / 20;
  const path = useMemo(() => buildPath(fit), [fit]);
  const landing = useMemo(() => landingPose(fit), [fit]);
  const centres = useMemo(() => SITES.map((s) => siteCenter(s)), []);

  const moon = useRef<THREE.DirectionalLight>(null);
  const warm = useRef<(THREE.PointLight | null)[]>([]);
  // Where the current flight took off from, and how long it lasts.
  const leg = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3(), seconds: 1, started: false });
  const orbit = useRef({ yaw: 0, pitch: 0 });
  const shown = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3() });

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05);
    const flight = world.flight;

    // A new request: take off from wherever the camera is right now.
    if (!leg.current.started) {
      leg.current.started = true;
      shown.current.pos.copy(path.poses[0].pos);
      shown.current.look.copy(path.poses[0].look);
    }
    if (world.journey && world.target !== flight.to) {
      flight.from = flight.to;
      flight.to = world.target;
      leg.current.pos.copy(shown.current.pos);
      leg.current.look.copy(shown.current.look);
      const distance = shown.current.pos.distanceTo(path.poses[flight.to].pos);
      leg.current.seconds = THREE.MathUtils.clamp(1.7 + distance / 1500, 2, 4.4);
      flight.t = world.snap || world.reduced ? 1 : 0;
      world.snap = false;
      // The flight starts from the turned view, so the turn itself is handed over to it.
      world.orbit.yaw = orbit.current.yaw = 0;
      world.orbit.pitch = orbit.current.pitch = 0;
    }
    if (flight.t < 1) flight.t = Math.min(1, flight.t + step / leg.current.seconds);
    const e = ease(flight.t);
    const resting = flight.t >= 1;

    // The flight path: a curve lifted above the straight line, so long trips climb over the map.
    const to = path.poses[flight.to];
    if (resting) {
      _pos.copy(to.pos);
      _look.copy(to.look);
    } else {
      _mid.lerpVectors(leg.current.pos, to.pos, 0.5);
      _mid.y += Math.min(1400, 0.22 * leg.current.pos.distanceTo(to.pos));
      _a.lerpVectors(leg.current.pos, _mid, e);
      _pos.lerpVectors(_mid, to.pos, e);
      _pos.lerpVectors(_a, _pos, e);
      _look.lerpVectors(leg.current.look, to.look, e);
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
    const presence = (stop: number) => {
      if (resting) return stop === flight.to ? 1 : 0;
      if (stop === flight.to) return smooth(e, 0.55, 0.95);
      if (stop === flight.from) return 1 - smooth(e, 0.03, 0.4);
      return 0;
    };
    for (let i = 0; i < SITES.length; i++) world.focus[i] = presence(i + 1);
    const overview = presence(0);
    world.wide = Math.max(overview, presence(LAST_STOP));

    // The route between venues. Flying on to the next day draws that leg under the camera;
    // the wide shots show the whole week's route at once.
    const onward = !resting && isDay(flight.from) && flight.to === flight.from + 1;
    for (let k = 0; k < world.legs.length; k++) {
      const whole = !isDay(flight.to) || k + 2 <= flight.to;
      if (onward && k === flight.to - 2) world.legs[k] = e;
      else world.legs[k] += ((world.journey && whole ? 1 : 0) - world.legs[k]) * Math.min(1, step * (world.reduced ? 60 : 2.2));
    }
    world.legActive = isDay(flight.to) ? flight.to - 2 : -1;

    // Look-around: on the overview the visitor turns and tilts the camera about the town centre.
    const o = orbit.current;
    const follow = Math.min(1, step * 9);
    o.yaw += (world.orbit.yaw - o.yaw) * follow;
    o.pitch += (world.orbit.pitch - o.pitch) * follow;
    if (flight.to === 0 && resting && (o.yaw !== 0 || o.pitch !== 0)) {
      _v.subVectors(_pos, _look);
      _axis.crossVectors(UP, _v).normalize();
      _v.applyAxisAngle(_axis, -o.pitch).applyAxisAngle(UP, o.yaw);
      _pos.copy(_look).add(_v);
    }

    shown.current.pos.copy(_pos);
    shown.current.look.copy(_look);
    camera.position.copy(_pos);
    camera.lookAt(_look);
    camera.fov = fovFor(aspect); // applied by setViewOffset below

    // Shift the picture so a venue sits beside (or above) its text card.
    const beside = (isDay(flight.to) ? e : 0) + (isDay(flight.from) && !resting ? 1 - e : 0);
    const day = resting ? (isDay(flight.to) ? 1 : 0) : Math.min(1, beside);
    const shiftX = aspect >= 1.05 ? -0.16 * day : 0;
    const shiftY = aspect >= 1.05 ? 0 : 0.18 * day;
    camera.setViewOffset(size.width, size.height, shiftX * size.width * introK, shiftY * size.height * introK, size.width, size.height);

    // The three warm lights belong to the venue in view and are dark mid-flight,
    // so they can jump to the next venue unseen.
    const nearer = e < 0.5 ? flight.from : flight.to;
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
