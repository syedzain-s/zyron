'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { damp } from '@/lib/utils';

/**
 * A single suspended slab. Used as the physical object behind a module card —
 * it tilts toward the pointer and brightens on hover so the flat HTML card in
 * front of it feels attached to something solid.
 */
export function Monolith({
  color = '#C8A44D',
  active = false,
  position = [0, 0, 0],
  rotationSeed = 0,
}: {
  color?: string;
  active?: boolean;
  position?: [number, number, number];
  rotationSeed?: number;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const edge = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime + rotationSeed;
    if (!mesh.current) return;
    const targetY = state.pointer.x * 0.5 + Math.sin(t * 0.3) * 0.12;
    const targetX = -state.pointer.y * 0.35 + Math.cos(t * 0.24) * 0.08;
    mesh.current.rotation.y = damp(mesh.current.rotation.y, targetY, 3, dt);
    mesh.current.rotation.x = damp(mesh.current.rotation.x, targetX, 3, dt);
    mesh.current.scale.setScalar(damp(mesh.current.scale.x, active ? 1.08 : 1, 5, dt));
    if (edge.current) {
      edge.current.rotation.copy(mesh.current.rotation);
      edge.current.scale.copy(mesh.current.scale);
    }
  });

  return (
    <Float speed={1.4} rotationIntensity={0.1} floatIntensity={0.6}>
      <group position={position}>
        {/* Gold shell, slightly larger, machined and polished. */}
        <RoundedBox ref={edge} args={[1.66, 2.26, 0.1]} radius={0.08} smoothness={5}>
          <meshPhysicalMaterial
            color={color}
            metalness={1}
            roughness={active ? 0.16 : 0.34}
            clearcoat={1}
            clearcoatRoughness={0.1}
            envMapIntensity={active ? 2.4 : 1.5}
          />
        </RoundedBox>
        {/* Dark lacquered face sitting proud of the shell. */}
        <RoundedBox ref={mesh} args={[1.54, 2.14, 0.17]} radius={0.06} smoothness={5}>
          <meshPhysicalMaterial
            color="#070C16"
            emissive={color}
            emissiveIntensity={active ? 0.24 : 0.07}
            metalness={0.55}
            roughness={0.22}
            clearcoat={1}
            clearcoatRoughness={0.06}
            envMapIntensity={1.2}
          />
        </RoundedBox>
      </group>
    </Float>
  );
}
