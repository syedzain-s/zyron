'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Packets travelling along a curved tube. Used in the safety section to show
 * an action moving from the agent, through the approval gate, to the outside
 * world — motion that carries meaning rather than decoration.
 */
export function DataConduit({
  from = new THREE.Vector3(-4, 0, 0),
  to = new THREE.Vector3(4, 0, 0),
  bow = 1.4,
  color = '#C8A44D',
  packets = 14,
  gateAt = 0.5,
  gateOpen = false,
}: {
  from?: THREE.Vector3;
  to?: THREE.Vector3;
  bow?: number;
  color?: string;
  packets?: number;
  gateAt?: number;
  gateOpen?: boolean;
}) {
  const curve = useMemo(() => {
    const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, bow, 0));
    return new THREE.QuadraticBezierCurve3(from, mid, to);
  }, [from, to, bow]);

  const dots = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const offsets = useMemo(
    () => Array.from({ length: packets }, (_, i) => i / packets),
    [packets],
  );

  useFrame((state) => {
    if (!dots.current) return;
    const t = state.clock.elapsedTime * 0.16;
    offsets.forEach((offset, i) => {
      let p = (offset + t) % 1;
      // Packets queue at the gate until it is opened.
      if (!gateOpen && p > gateAt) p = gateAt - ((p - gateAt) % 0.04) * 0.6;
      const point = curve.getPoint(Math.max(p, 0.001));
      dummy.position.copy(point);
      dummy.scale.setScalar(0.055);
      dummy.updateMatrix();
      dots.current!.setMatrixAt(i, dummy.matrix);
    });
    dots.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 64, 0.012, 8, false]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} />
      </mesh>

      <instancedMesh ref={dots} args={[undefined, undefined, packets]}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial color={color} />
      </instancedMesh>

      {/* The gate itself */}
      <mesh position={curve.getPoint(gateAt)} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.42, 0.02, 10, 48]} />
        <meshStandardMaterial
          color={gateOpen ? '#5B6A8C' : '#C8A44D'}
          emissive={gateOpen ? '#5B6A8C' : '#C8A44D'}
          emissiveIntensity={gateOpen ? 2.2 : 1.1}
        />
      </mesh>
    </group>
  );
}
