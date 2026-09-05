'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * A receding wire floor. It is the cheapest honest way to establish a horizon
 * and give the flat sections a real sense of ground and perspective.
 */
export function GridFloor({
  y = -3.2,
  color = '#1A2437',
  divisions = 40,
  size = 40,
}: {
  y?: number;
  color?: string;
  divisions?: number;
  size?: number;
}) {
  const grid = useRef<THREE.GridHelper>(null);

  useFrame((_, delta) => {
    if (!grid.current) return;
    // Scroll the floor toward the camera so it reads as forward travel.
    grid.current.position.z = (grid.current.position.z + delta * 0.9) % (size / divisions);
  });

  return (
    <group position={[0, y, 0]}>
      <gridHelper
        ref={grid}
        args={[size, divisions, new THREE.Color(color), new THREE.Color(color)]}
      />
      {/* Fog-out plane so the grid dissolves instead of ending abruptly. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -8]}>
        <planeGeometry args={[size, size * 0.7]} />
        <meshBasicMaterial color="#04060C" transparent opacity={0.72} />
      </mesh>
    </group>
  );
}
