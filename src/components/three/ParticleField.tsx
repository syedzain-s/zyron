'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ParticleFieldProps {
  count?: number;
  radius?: number;
  color?: string;
  size?: number;
  /** How strongly the field drifts against the pointer. */
  parallax?: number;
}

/**
 * A depth field of drifting points. Rendered behind every major section so the
 * page always has something happening in Z, not just on the surface.
 */
export function ParticleField({
  count = 900,
  radius = 14,
  color = '#8B94A9',
  size = 0.028,
  parallax = 0.35,
}: ParticleFieldProps) {
  const points = useRef<THREE.Points>(null);

  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      // Spherical distribution biased outward so the centre stays readable.
      const r = radius * (0.35 + Math.pow(Math.random(), 0.6) * 0.65);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55;
      positions[i * 3 + 2] = r * Math.cos(phi);
      speeds[i] = 0.15 + Math.random() * 0.5;
    }
    return { positions, speeds };
  }, [count, radius]);

  useFrame((state, delta) => {
    if (!points.current) return;
    const dt = Math.min(delta, 0.1);
    const attr = points.current.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;

    for (let i = 0; i < count; i += 1) {
      const y = i * 3 + 1;
      arr[y] += speeds[i] * dt * 0.35;
      if (arr[y] > radius * 0.55) arr[y] = -radius * 0.55;
    }
    attr.needsUpdate = true;

    points.current.rotation.y += dt * 0.012;
    points.current.position.x = state.pointer.x * parallax;
    points.current.position.y = state.pointer.y * parallax * 0.6;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={color}
        size={size}
        sizeAttenuation
        transparent
        opacity={0.55}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
