"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { DAY_COLORS, SITES, siteCenter } from "@/lib/journey";
import { world } from "@/lib/world";
import { radialTexture } from "./kit";

const HEIGHT = 420;

/**
 * A column of light over each venue in its day colour, with a soft glow at its foot.
 * Both stay a readable size from any distance, and fade away as the camera arrives at the venue.
 */
function Beacon({ index }: { index: number }) {
  const site = SITES[index];
  const [x, , z] = siteCenter(site);
  const glow = useRef<THREE.Mesh>(null);
  const color = useMemo(() => new THREE.Color(DAY_COLORS[index]), [index]);

  const column = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: color }, uPower: { value: 0 } },
        vertexShader: /* glsl */ `
          varying float vUp;
          void main() {
            vUp = uv.y;
            vec4 w = modelMatrix * vec4(0.0, position.y, 0.0, 1.0);
            // Thin up close, never narrower than a couple of pixels from the air.
            float r = max(0.9, length(cameraPosition - w.xyz) * 0.003) * mix(1.0, 0.3, uv.y);
            w.xz += normalize(position.xz) * r;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          uniform float uPower;
          varying float vUp;
          void main() {
            float a = pow(1.0 - vUp, 1.8) * uPower;
            gl_FragColor = vec4(uColor * a * 2.2, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [color],
  );
  const geometry = useMemo(() => new THREE.CylinderGeometry(1, 1, HEIGHT, 12, 1, true).translate(0, HEIGHT / 2, 0), []);
  const foot = useMemo(
    () => new THREE.MeshBasicMaterial({ map: radialTexture(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -6 }),
    [color],
  );
  const disc = useMemo(() => new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), []);

  useFrame(({ camera, clock }) => {
    const on = world.beacon[index];
    const near = world.focus[index];
    const pulse = world.reduced ? 1 : 0.85 + 0.15 * Math.sin(clock.elapsedTime * 1.6 + index * 1.3);
    // The ignition overshoots for a moment, like a flare catching.
    const flare = 1 + 1.6 * Math.sin(Math.min(1, on) * Math.PI) * (world.journey ? 0 : 1);
    column.uniforms.uPower.value = on * (1 - near) * 0.85 * pulse * flare;
    foot.opacity = on * (0.75 - 0.5 * near) * pulse;
    if (glow.current) {
      const dist = Math.hypot(camera.position.x - x, camera.position.y, camera.position.z - z);
      glow.current.scale.setScalar(Math.max(24, dist * 0.04));
    }
  });

  return (
    <group position={[x, 0, z]}>
      <mesh geometry={geometry} material={column} frustumCulled={false} renderOrder={4} />
      <mesh ref={glow} geometry={disc} material={foot} position={[0, 0.25, 0]} renderOrder={3} />
    </group>
  );
}

export function Beacons() {
  return (
    <>
      {SITES.map((s, i) => (
        <Beacon key={s.id} index={i} />
      ))}
    </>
  );
}
