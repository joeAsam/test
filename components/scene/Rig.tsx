"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { LAST_STOP, SITES, buildPath, dwell, fitFor, fovFor, landingPose, samplePath, siteCenter, siteLocal, viewShift } from "@/lib/journey";
import { FULL_REACH, INTRO_SECONDS, world } from "@/lib/world";

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Intro beats, in seconds after the visitor says yes. */
const SPREAD_FROM = 0.8;
const SPREAD_FOR = 5.2;
const BEACONS_FROM = 6.1;
const BEACON_GAP = 0.55;
const CAMERA_FOR = 9.4;

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _right = new THREE.Vector3();
const _v = new THREE.Vector3();

/**
 * Drives the camera and everything tied to it: the intro, the flights between stops,
 * each venue's focus, the pooled warm lights, the shadow light and the map pins.
 */
export function Rig({ shadows, mapSize }: { shadows: boolean; mapSize: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const aspect = size.width / size.height;
  // Rebuild the path only when the screen shape changes enough to matter.
  const fit = Math.round(fitFor(aspect) * 20) / 20;
  const path = useMemo(() => buildPath(fit), [fit]);
  const landing = useMemo(() => landingPose(fit), [fit]);
  const centres = useMemo(() => SITES.map((s) => siteCenter(s)), []);

  const moon = useRef<THREE.DirectionalLight>(null);
  const warm = useRef<(THREE.PointLight | null)[]>([]);
  const drift = useRef({ x: 0, y: 0 });

  useFrame(({ clock }, dt) => {
    const step = Math.min(dt, 0.05);
    const t = clock.elapsedTime;

    // Scroll position → smoothed stop. Reduced motion follows the scroll directly.
    const k = world.reduced ? 1 : 1 - Math.exp(-step * 3.2);
    world.stopSmooth += (world.stop - world.stopSmooth) * k;
    const stop = THREE.MathUtils.clamp(dwell(world.stopSmooth), 0, LAST_STOP);
    samplePath(path, stop, _pos, _look);

    // Intro: the light spreads through the streets, the beacons ignite, the camera comes down.
    let introK = 1;
    if (world.journey) {
      world.reach = FULL_REACH;
      world.beacon.fill(1);
    } else {
      if (world.introT >= 0) world.introT += step;
      const it = world.introT;
      world.reach = it < SPREAD_FROM ? 0 : FULL_REACH * Math.pow(clamp01((it - SPREAD_FROM) / SPREAD_FOR), 1.7);
      for (let i = 0; i < SITES.length; i++) world.beacon[i] = THREE.MathUtils.smoothstep(it, BEACONS_FROM + i * BEACON_GAP, BEACONS_FROM + i * BEACON_GAP + 0.8);
      introK = it < 0 ? 0 : ease(clamp01(it / CAMERA_FOR));
      // A slow drift high over the dark town while the question is on screen.
      _v.copy(landing.pos);
      if (!world.reduced) _v.x += Math.sin(t * 0.07) * 380 * (1 - introK);
      _pos.lerpVectors(_v, _pos, introK);
      _look.lerpVectors(landing.look, _look, introK);
      if (it >= INTRO_SECONDS) world.journey = true;
    }

    // Focus: 1 on the venue in view, falling to 0 by the midpoint of a flight.
    for (let i = 0; i < SITES.length; i++) world.focus[i] = clamp01(1 - Math.abs(stop - (i + 1)));
    const overview = clamp01(1 - stop);
    world.wide = Math.max(overview, clamp01(stop - (LAST_STOP - 1)));

    // Pointer parallax and a slow breathing drift, scaled to how far away the subject is.
    if (!world.reduced) {
      const reach = _pos.distanceTo(_look) * 0.022;
      drift.current.x += (world.pointer.x - drift.current.x) * Math.min(1, step * 2.5);
      drift.current.y += (world.pointer.y - drift.current.y) * Math.min(1, step * 2.5);
      _right.subVectors(_look, _pos).cross(camera.up).normalize();
      _pos.addScaledVector(_right, (drift.current.x * 1.4 + Math.sin(t * 0.23) * 0.5) * reach);
      _pos.y += (-drift.current.y * 0.8 + Math.sin(t * 0.31) * 0.25) * reach;
    }

    camera.position.copy(_pos);
    camera.lookAt(_look);
    camera.fov = fovFor(aspect); // applied by setViewOffset below

    // Shift the picture so the venue sits beside (or above) the text card.
    const shift = viewShift(stop, aspect);
    camera.setViewOffset(size.width, size.height, shift.x * size.width * introK, shift.y * size.height * introK, size.width, size.height);

    // The three warm lights belong to the nearest venue and dim to nothing mid-flight,
    // so they can jump to the next venue unseen.
    const active = THREE.MathUtils.clamp(Math.round(stop) - 1, 0, SITES.length - 1);
    const site = SITES[active];
    const lit = THREE.MathUtils.smoothstep(world.focus[active], 0.5, 0.92);
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

    // Map pins: shown on the overview, pinned to the screen edge when their venue is out of frame.
    camera.updateMatrixWorld();
    for (let i = 0; i < SITES.length; i++) {
      const el = world.pins[i];
      if (!el) continue;
      const o = overview * world.beacon[i];
      if (o < 0.02) {
        el.style.opacity = "0";
        el.style.pointerEvents = "none";
        continue;
      }
      _v.set(centres[i][0], 0, centres[i][2]).project(camera);
      const behind = _v.z > 1;
      const mx = Math.min(140, size.width * 0.2);
      let x = (_v.x * 0.5 + 0.5) * size.width;
      let y = (-_v.y * 0.5 + 0.5) * size.height;
      if (behind) x = _v.x > 0 ? mx : size.width - mx;
      const cx = THREE.MathUtils.clamp(x, mx, size.width - mx);
      const edge = cx !== x;
      // Edge pins wait in the middle band, clear of the title above and the footer below.
      // On a tall screen the title fills the top half, so pins keep to the lower half.
      const top = aspect < 1 ? size.height * 0.5 : 150;
      const cy = edge ? THREE.MathUtils.clamp(y, size.height * 0.5, size.height * 0.72) : THREE.MathUtils.clamp(y, top, size.height - 120);
      el.dataset.edge = edge ? (x < cx ? "left" : "right") : "";
      el.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      el.style.opacity = o.toFixed(3);
      el.style.pointerEvents = o > 0.6 && world.journey ? "auto" : "none";
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
