"use client";

import { addAfterEffect, Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { SITES, siteCenter, siteYaw } from "@/lib/journey";
import { pinnedQuality, startingQuality, world, type Quality } from "@/lib/world";
import { Beacons } from "./Beacons";
import { EketMap, FOG_COLOR, FOG_DENSITY } from "./Map";
import { Rig } from "./Rig";
import { Sky } from "./Sky";
import { setBloom } from "./kit";
import { Cinema } from "./sites/Cinema";
import { Gala } from "./sites/Gala";
import { Hall } from "./sites/Hall";
import { House } from "./sites/House";
import { Lounge } from "./sites/Lounge";

const BUDGET: Record<Quality, { dpr: [number, number]; stars: number; cars: number; farLights: number; shadowMap: number; samples: number }> = {
  high: { dpr: [1, 2], stars: 1400, cars: 220, farLights: 2600, shadowMap: 2048, samples: 4 },
  // Sized for laptops with built-in graphics: full glow and shadows at one pixel per pixel.
  medium: { dpr: [1, 1], stars: 1000, cars: 150, farLights: 1800, shadowMap: 1024, samples: 0 },
  low: { dpr: [0.85, 1], stars: 600, cars: 80, farLights: 1000, shadowMap: 1024, samples: 0 },
};

/** Venue models stand a little above the map so the streets never cut across their plinths. */
const PLINTH_LIFT = 0.45;

/** Places a venue model at its real spot on the map, turned to face its street. */
function OnMap({ index, children }: { index: number; children: ReactNode }) {
  const site = SITES[index];
  const [x, , z] = siteCenter(site);
  return (
    <group position={[x, PLINTH_LIFT, z]} rotation-y={siteYaw(site)}>
      {children}
    </group>
  );
}

function Fog() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
    return () => {
      scene.fog = null;
    };
  }, [scene]);
  return null;
}

/**
 * Steps the quality down if the frame rate stays low. Frames from a hidden or throttled
 * tab are ignored: they say nothing about what the graphics chip can do.
 */
function Governor({ onDecline }: { onDecline: () => void }) {
  const acc = useRef({ time: 0, frames: 0, slow: 0, settle: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    // Loading and the intro are not a fair test: judge only once the journey has settled.
    if (!world.journey) {
      a.settle = 0;
      return;
    }
    if ((a.settle += dt) < 4) return;
    if (document.hidden || dt > 0.2) {
      a.time = 0;
      a.frames = 0;
      return;
    }
    a.time += dt;
    a.frames++;
    if (a.time < 2) return;
    const fps = a.frames / a.time;
    a.time = 0;
    a.frames = 0;
    a.slow = fps < 42 ? a.slow + 1 : 0;
    if (a.slow >= 3) {
      a.slow = 0;
      onDecline();
    }
  });
  return null;
}

export default function Scene({ onReady }: { onReady: () => void }) {
  const [quality, setQuality] = useState<Quality>(startingQuality);
  const budget = BUDGET[quality];
  const post = quality !== "low";
  world.quality = quality;
  setBloom(post);

  return (
    <Canvas
      flat
      dpr={budget.dpr}
      shadows={quality === "low" ? false : quality === "high" ? "soft" : "percentage"}
      gl={{ antialias: !post, powerPreference: "high-performance", alpha: false, stencil: false }}
      camera={{ fov: 32, near: 2, far: 70000, position: [200, 4300, 6700] }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(FOG_COLOR);
        // Dev-only hook: the live state, and a way to grab a finished frame as an image.
        if (process.env.NODE_ENV !== "production") {
          const shot = () =>
            new Promise<string>((resolve) => {
              const off = addAfterEffect(() => {
                off();
                resolve(gl.domElement.toDataURL("image/jpeg", 0.86));
              });
            });
          (window as unknown as { __atlas?: unknown }).__atlas = { world, gl, scene, shot };
        }
      }}
    >
      <Fog />
      {!pinnedQuality() && <Governor onDecline={() => setQuality((q) => (q === "high" ? "medium" : "low"))} />}

      <Sky stars={budget.stars} />
      <Rig shadows={quality !== "low"} mapSize={budget.shadowMap} />
      <EketMap cars={budget.cars} farLights={budget.farLights} onReady={onReady} />
      <Beacons />

      <OnMap index={0}>
        <Hall />
      </OnMap>
      <OnMap index={1}>
        <Cinema />
      </OnMap>
      <OnMap index={2}>
        <House />
      </OnMap>
      <OnMap index={3}>
        <Lounge />
      </OnMap>
      <OnMap index={4}>
        <Gala />
      </OnMap>

      {post && (
        <EffectComposer multisampling={budget.samples} enableNormalPass={false}>
          <Bloom mipmapBlur intensity={0.85} luminanceThreshold={1} luminanceSmoothing={0.2} radius={0.72} />
          <Vignette offset={0.26} darkness={0.7} />
          <Noise opacity={0.025} premultiply />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
