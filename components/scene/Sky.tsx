"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { MOON_DIR, type V3 } from "@/lib/journey";
import { world } from "@/lib/world";
import { radialTexture, seeded } from "./kit";

const FAR = 30000;

function moonTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f4efe4";
  ctx.fillRect(0, 0, 256, 256);
  const rand = seeded(42);
  for (let i = 0; i < 18; i++) {
    const x = rand() * 256;
    const y = 40 + rand() * 176;
    const r = 8 + rand() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(176,172,170,0.6)");
    g.addColorStop(1, "rgba(176,172,170,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Night sky that travels with the camera: a deep gradient, stars and the moon in the north. */
export function Sky({ stars = 900 }: { stars?: number }) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const dpr = useThree((s) => s.viewport.dpr);

  const dome = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color("#02030f") },
          uMid: { value: new THREE.Color("#0a1038") },
          uLow: { value: new THREE.Color("#080b20") },
          uGlow: { value: new THREE.Color("#1b2350") },
          uMoon: { value: MOON_DIR.clone() },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop, uMid, uLow, uGlow, uMoon;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 col = mix(uLow, uMid, smoothstep(-0.02, 0.1, h));
            col = mix(col, uTop, smoothstep(0.08, 0.6, h));
            // Haze over the horizon, lifted a little by the town's own light.
            col += uGlow * exp(-pow((h - 0.03) / 0.07, 2.0)) * 0.45;
            float m = max(dot(d, uMoon), 0.0);
            col += vec3(0.55, 0.64, 1.0) * (pow(m, 220.0) * 0.5 + pow(m, 14.0) * 0.1);
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );

  const starField = useMemo(() => {
    const rand = seeded(7);
    const pos = new Float32Array(stars * 3);
    const seedAttr = new Float32Array(stars * 2);
    for (let i = 0; i < stars; i++) {
      const y = 0.02 + rand() * 0.98;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * FAR, y * FAR, Math.sin(a) * r * FAR], i * 3);
      seedAttr.set([rand(), rand()], i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seedAttr, 2));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uDpr: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec2 aSeed;
        uniform float uTime, uDpr;
        varying float vA;
        varying float vWarm;
        void main() {
          float tw = 0.7 + 0.3 * sin(uTime * (0.6 + aSeed.x * 1.8) + aSeed.y * 40.0);
          // Stars thin out toward the hazy horizon.
          vA = tw * (0.3 + 0.7 * aSeed.y) * smoothstep(0.02, 0.22, normalize(position).y);
          vWarm = aSeed.x;
          gl_PointSize = (1.2 + aSeed.y * aSeed.y * 2.4) * uDpr;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        varying float vWarm;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * vA;
          vec3 col = mix(vec3(0.78, 0.86, 1.0), vec3(1.0, 0.92, 0.8), step(0.75, vWarm));
          gl_FragColor = vec4(col * a * 1.4, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { g, m };
  }, [stars]);

  const moonMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ map: moonTexture(), fog: false });
    m.color.setScalar(1.25);
    return m;
  }, []);
  const haloMat = useMemo(
    () => new THREE.SpriteMaterial({ map: radialTexture(), color: "#8fa2ff", transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    [],
  );
  const moonAt = useMemo(() => MOON_DIR.clone().multiplyScalar(FAR * 0.86).toArray() as V3, []);

  useFrame(({ clock }) => {
    group.current?.position.copy(camera.position);
    starField.m.uniforms.uTime.value = world.reduced ? 0 : clock.elapsedTime;
    starField.m.uniforms.uDpr.value = dpr;
  });

  return (
    <group ref={group}>
      <mesh material={dome} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[FAR, 32, 24]} />
      </mesh>
      <points geometry={starField.g} material={starField.m} renderOrder={-9} frustumCulled={false} />
      <sprite material={haloMat} position={moonAt} scale={[6200, 6200, 1]} renderOrder={-8} />
      <mesh material={moonMat} position={moonAt} renderOrder={-7}>
        <sphereGeometry args={[640, 40, 28]} />
      </mesh>
    </group>
  );
}
