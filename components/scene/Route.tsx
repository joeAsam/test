"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { loadCity } from "@/lib/city";
import { DAY_COLORS } from "@/lib/journey";
import { buildLegs, type Leg } from "@/lib/route";
import { world } from "@/lib/world";
import { FOG_COLOR, FOG_DENSITY } from "./Map";

/** A ribbon along one leg. `aT` runs 0 → 1 from the venue it leaves to the venue it reaches. */
function legGeometry(leg: Leg) {
  const n = leg.length / 2;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(leg[2 * i] - leg[2 * i - 2], leg[2 * i + 1] - leg[2 * i - 1]));
  const total = cum[n - 1] || 1;
  const pos: number[] = [];
  const nrm: number[] = [];
  const side: number[] = [];
  const along: number[] = [];
  const metres: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let tx = leg[2 * b] - leg[2 * a];
    let tz = leg[2 * b + 1] - leg[2 * a + 1];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    // Above the tarmac, below the venue plinths.
    pos.push(leg[2 * i], 0.3, leg[2 * i + 1], leg[2 * i], 0.3, leg[2 * i + 1]);
    nrm.push(-tz, tx, -tz, tx);
    side.push(-1, 1);
    along.push(cum[i] / total, cum[i] / total);
    metres.push(cum[i], cum[i]);
    if (i < n - 1) idx.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aN", new THREE.Float32BufferAttribute(nrm, 2));
  g.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute("aT", new THREE.Float32BufferAttribute(along, 1));
  g.setAttribute("aMetres", new THREE.Float32BufferAttribute(metres, 1));
  g.setIndex(idx);
  return { geometry: g, total };
}

function LegLine({ leg, index }: { leg: Leg; index: number }) {
  const { geometry, total } = useMemo(() => legGeometry(leg), [leg]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        // Normal blending: where two legs share a road the later one covers the earlier, instead of adding up to white.
        polygonOffset: true,
        polygonOffsetFactor: -8,
        polygonOffsetUnits: -8,
        uniforms: {
          // The leg takes the colour of the day it leads to.
          uColor: { value: new THREE.Color(DAY_COLORS[index + 1]) },
          uDrawn: { value: 0 },
          uPower: { value: 0.9 },
          uTime: { value: 0 },
          uTotal: { value: total },
          uFogColor: { value: new THREE.Color(FOG_COLOR) },
          uFogDensity: { value: FOG_DENSITY },
        },
        vertexShader: /* glsl */ `
          attribute vec2 aN;
          attribute float aSide, aT, aMetres;
          varying float vSide, vT, vMetres, vDist;
          void main() {
            vSide = aSide; vT = aT; vMetres = aMetres;
            vec4 w = modelMatrix * vec4(position, 1.0);
            vDist = length(cameraPosition - w.xyz);
            // A lane wide up close; a clear line a few pixels wide from the air.
            w.xz += aN * aSide * max(2.6, vDist * 0.0026);
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor, uFogColor;
          uniform float uDrawn, uPower, uTime, uTotal, uFogDensity;
          varying float vSide, vT, vMetres, vDist;
          void main() {
            if (vT > uDrawn) discard;
            float core = 1.0 - abs(vSide);
            // Pulses of light travel along the route toward the next venue.
            float gap = clamp(vDist * 0.09, 40.0, 420.0);
            float pulse = pow(0.5 + 0.5 * sin((vMetres - uTime * gap * 0.9) / gap * 6.2831), 6.0);
            // The leading edge burns brightest while the leg is being drawn.
            float head = exp(-pow((uDrawn - vT) * uTotal / max(60.0, vDist * 0.12), 2.0)) * step(uDrawn, 0.999);
            // A solid coloured band with a soft edge, so it reads clearly over the amber streets.
            float band = smoothstep(0.0, 0.35, core);
            float glow = 0.62 + 0.3 * pulse + 0.9 * head;
            float a = clamp(band * uPower, 0.0, 1.0);
            a *= exp(-uFogDensity * uFogDensity * vDist * vDist);
            gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.15 * head) * glow * 1.5, a * 0.92);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [index, total],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock }, dt) => {
    const u = material.uniforms;
    u.uDrawn.value = world.legs[index];
    u.uTime.value = world.reduced ? 0 : clock.elapsedTime;
    // On a day, the leg just travelled stands out and earlier ones step back.
    const wanted = world.legActive < 0 ? 0.9 : index === world.legActive ? 1 : 0.45;
    u.uPower.value += (wanted - u.uPower.value) * Math.min(1, dt * 5);
  });
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={5 + index} />;
}

/** The week's route: a line of light along real roads from each day's venue to the next. */
export function Route() {
  const [legs, setLegs] = useState<Leg[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadCity().then((city) => alive && setLegs(buildLegs(city)));
    return () => {
      alive = false;
    };
  }, []);
  if (!legs) return null;
  return (
    <>
      {legs.map((leg, i) => (
        <LegLine key={i} leg={leg} index={i} />
      ))}
    </>
  );
}
