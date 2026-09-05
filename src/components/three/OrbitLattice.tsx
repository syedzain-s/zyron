'use client';

import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Line, Text } from '@react-three/drei';
import * as THREE from 'three';

export interface LatticeNode {
  code: string;
  label: string;
  tier: 'core' | 'extended' | 'signature';
}

const TIER_COLOR: Record<LatticeNode['tier'], string> = {
  core: '#ECD79F',
  extended: '#C8A44D',
  signature: '#5B6A8C',
};

/**
 * The orchestrator and its sub-agents, in space. Nodes orbit a central hub on
 * three inclined shells; each spoke is a live connection line back to the hub.
 * Hovering a node lifts it and names it.
 */
export function OrbitLattice({
  nodes,
  onFocus,
}: {
  nodes: LatticeNode[];
  onFocus?: (code: string | null) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const placed = useMemo(() => {
    const shells = [2.5, 3.5, 4.4];
    return nodes.map((node, i) => {
      const shell = shells[i % shells.length];
      const golden = Math.PI * (3 - Math.sqrt(5));
      const yNorm = 1 - (i / Math.max(nodes.length - 1, 1)) * 1.7;
      const r = Math.sqrt(Math.max(1 - yNorm * yNorm, 0.05));
      const theta = golden * i;
      return {
        ...node,
        position: new THREE.Vector3(
          Math.cos(theta) * r * shell,
          yNorm * shell * 0.55,
          Math.sin(theta) * r * shell,
        ),
        speed: 0.05 + (i % 5) * 0.012,
      };
    });
  }, [nodes]);

  useFrame((state, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.06;
    group.current.rotation.x = THREE.MathUtils.lerp(
      group.current.rotation.x,
      state.pointer.y * 0.22,
      0.04,
    );
  });

  return (
    <group ref={group}>
      {/* Orchestrator hub */}
      <mesh>
        <octahedronGeometry args={[0.6, 0]} />
        <meshStandardMaterial
          color="#C8A44D"
          emissive="#C8A44D"
          emissiveIntensity={1.6}
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.95, 32, 32]} />
        <meshBasicMaterial color="#C8A44D" transparent opacity={0.05} />
      </mesh>
      <pointLight intensity={9} distance={10} color="#C8A44D" />

      {placed.map((node) => {
        const active = hovered === node.code;
        const color = TIER_COLOR[node.tier];
        return (
          <group key={node.code}>
            <Line
              points={[new THREE.Vector3(0, 0, 0), node.position]}
              color={color}
              transparent
              opacity={active ? 0.7 : 0.14}
              lineWidth={active ? 1.6 : 0.7}
            />
            <mesh
              position={node.position}
              scale={active ? 1.6 : 1}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHovered(node.code);
                onFocus?.(node.code);
              }}
              onPointerOut={() => {
                setHovered(null);
                onFocus?.(null);
              }}
            >
              <boxGeometry args={[0.2, 0.2, 0.2]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={active ? 2.4 : 0.7}
                metalness={0.7}
                roughness={0.25}
              />
            </mesh>
            {active && (
              <Billboard position={node.position.clone().add(new THREE.Vector3(0, 0.42, 0))}>
                <Text fontSize={0.19} color="#EDEEF3" anchorX="center" outlineWidth={0.006} outlineColor="#04060C">
                  {node.label}
                </Text>
              </Billboard>
            )}
          </group>
        );
      })}
    </group>
  );
}
