"use client";

/**
 * Hero scene: a field of ~7k particles that assembles into the ₹ glyph,
 * breathes, parallaxes with the pointer and repels around the cursor.
 *
 * The glyph is rasterised at runtime from a canvas 2D context (no external
 * assets), sampled into particle targets. Everything is procedural so the
 * bundle stays light and nothing depends on runtime CDNs.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const PARTICLES = 7000;
const DUST = 700;
const ASSEMBLE_TIME = 2.4; // seconds for the scatter→glyph assembly

/** Sample the ₹ glyph into 3D target points via an offscreen canvas. */
function sampleRupeeGlyph(count: number): Float32Array {
  const size = 360;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.floor(size * 0.82)}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("₹", size / 2, size / 2 + size * 0.04);

  const { data } = ctx.getImageData(0, 0, size, size);
  const pts: Array<[number, number]> = [];
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      if (data[(y * size + x) * 4] > 120) pts.push([x, y]);
    }
  }

  const targets = new Float32Array(count * 3);
  const scale = 4.6 / size;
  for (let i = 0; i < count; i++) {
    const [px, py] = pts[(Math.random() * pts.length) | 0] ?? [size / 2, size / 2];
    targets[i * 3] = (px - size / 2) * scale + (Math.random() - 0.5) * 0.02;
    targets[i * 3 + 1] = (size / 2 - py) * scale + (Math.random() - 0.5) * 0.02;
    targets[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
  }
  return targets;
}

/** Soft round sprite so points render as glow dots, not squares. */
function makeGlowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function RupeeParticles({ reducedMotion }: { reducedMotion: boolean }) {
  const points = useRef<THREE.Points>(null!);
  const group = useRef<THREE.Group>(null!);
  const { raycaster } = useThree();

  const { startPositions, targets, colors, delays, glow } = useMemo(() => {
    const targets = sampleRupeeGlyph(PARTICLES);
    const startPositions = new Float32Array(PARTICLES * 3);
    const colors = new Float32Array(PARTICLES * 3);
    const delays = new Float32Array(PARTICLES);

    const saffron = new THREE.Color("#ff9933");
    const gold = new THREE.Color("#ffd9a0");
    const ember = new THREE.Color("#ff6a00");

    for (let i = 0; i < PARTICLES; i++) {
      // start scattered on a loose sphere shell
      const r = 7 + Math.random() * 7;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      startPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      startPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      startPositions[i * 3 + 2] = r * Math.cos(phi) - 2;

      // colour: vertical gold→saffron→ember gradient with sparkle outliers
      const ty = targets[i * 3 + 1] / 2.3; // -1..1
      const c = ty > 0 ? gold.clone().lerp(saffron, 1 - ty) : saffron.clone().lerp(ember, -ty);
      if (Math.random() < 0.04) c.set("#fff6e6");
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

      delays[i] = Math.random() * 0.9;
    }
    return { startPositions, targets, colors, delays, glow: makeGlowTexture() };
  }, []);

  const live = useMemo(
    () => (reducedMotion ? targets.slice() : startPositions.slice()),
    [reducedMotion, startPositions, targets]
  );

  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);
  const mouse3 = useMemo(() => new THREE.Vector3(99, 99, 0), []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const positions = points.current.geometry.attributes.position;

    // pointer → point on the glyph plane (for repulsion)
    raycaster.setFromCamera(state.pointer, state.camera);
    raycaster.ray.intersectPlane(plane, mouse3);

    // gentle parallax of the whole group toward the pointer
    if (group.current && !reducedMotion) {
      group.current.rotation.y += (state.pointer.x * 0.16 - group.current.rotation.y) * Math.min(delta * 2.4, 1);
      group.current.rotation.x += (-state.pointer.y * 0.1 - group.current.rotation.x) * Math.min(delta * 2.4, 1);
    }

    const arr = positions.array as Float32Array;
    for (let i = 0; i < PARTICLES; i++) {
      const i3 = i * 3;
      const progress = reducedMotion
        ? 1
        : Math.min(Math.max((t - 0.25 - delays[i]) / ASSEMBLE_TIME, 0), 1);
      const e = easeOutCubic(progress);

      let x = startPositions[i3] + (targets[i3] - startPositions[i3]) * e;
      let y = startPositions[i3 + 1] + (targets[i3 + 1] - startPositions[i3 + 1]) * e;
      let z = startPositions[i3 + 2] + (targets[i3 + 2] - startPositions[i3 + 2]) * e;

      if (!reducedMotion) {
        // breathing shimmer once mostly assembled
        z += Math.sin(t * 1.4 + i * 0.37) * 0.045 * e;

        // cursor repulsion
        const dx = x - mouse3.x;
        const dy = y - mouse3.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 1.21 && e > 0.6) {
          const dist = Math.sqrt(distSq) || 0.001;
          const force = (1.1 - dist) * 0.55;
          x += (dx / dist) * force;
          y += (dy / dist) * force;
          z += force * 0.18;
        }
      }

      // ease the live position toward the computed one for fluidity
      live[i3] += (x - live[i3]) * Math.min(delta * 9, 1);
      live[i3 + 1] += (y - live[i3 + 1]) * Math.min(delta * 9, 1);
      live[i3 + 2] += (z - live[i3 + 2]) * Math.min(delta * 9, 1);

      arr[i3] = live[i3];
      arr[i3 + 1] = live[i3 + 1];
      arr[i3 + 2] = live[i3 + 2];
    }
    positions.needsUpdate = true;
  });

  return (
    <group ref={group} position={[1.35, 0.1, 0]}>
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[live.slice(), 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.052}
          map={glow}
          vertexColors
          transparent
          opacity={0.95}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

/** Slow ambient dust for depth. */
function Dust() {
  const ref = useRef<THREE.Points>(null!);
  const { positions, glow } = useMemo(() => {
    const positions = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 2] = -2 - Math.random() * 9;
    }
    return { positions, glow: makeGlowTexture() };
  }, []);

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.elapsedTime * 0.012;
      ref.current.rotation.z = state.clock.elapsedTime * 0.004;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.07}
        map={glow}
        color="#7f9bc4"
        transparent
        opacity={0.35}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

export default function HeroScene({ reducedMotion = false }: { reducedMotion?: boolean }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 7.5], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden
    >
      <RupeeParticles reducedMotion={reducedMotion} />
      <Dust />
    </Canvas>
  );
}
