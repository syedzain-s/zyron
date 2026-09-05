'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, ContactShadows, RoundedBox, Text } from '@react-three/drei';
import * as THREE from 'three';
import { SceneCanvas } from '@/components/three/SceneCanvas';
import { SceneFallback } from '@/components/three/SceneFallback';
import { StageLights } from '@/components/three/StageLights';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { damp } from '@/lib/utils';

const LAYERS = [
  {
    name: 'Interface',
    color: '#ECD79F',
    items: ['Next.js App Router', 'React 18 + TypeScript', 'Tailwind CSS', 'Framer Motion'],
    note: 'Server components for data, client components only where there is motion or state.',
  },
  {
    name: 'Spatial layer',
    color: '#C8A44D',
    items: ['three.js', 'React Three Fiber', 'drei', 'GLSL shaders'],
    note: 'One shared canvas wrapper, viewport-lazy contexts, adaptive DPR.',
  },
  {
    name: 'Agent runtime',
    color: '#8A6D22',
    items: ['Intent router', 'Module registry', 'Tool executor', 'Approval queue'],
    note: 'Route handlers under /api/agent. Swappable model provider behind one interface.',
  },
  {
    name: 'Memory',
    color: '#5B6A8C',
    items: ['MongoDB Atlas', 'Atlas Vector Search', 'Entity graph', 'Event log'],
    note: 'Documents for state, vectors for recall, an append-only log for the audit trail.',
  },
  {
    name: 'Connectors',
    color: '#2C3852',
    items: ['Gmail + Calendar', 'WhatsApp Cloud API', 'Wearables', 'Bank + OCR'],
    note: 'Each connector is an adapter with its own scopes, retries and rate limits.',
  },
];

function StackScene({ active }: { active: number }) {
  const group = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!group.current) return;
    const dt = Math.min(delta, 0.1);
    group.current.rotation.y = damp(group.current.rotation.y, -0.5 + state.pointer.x * 0.4, 3, dt);
    group.current.rotation.x = damp(group.current.rotation.x, 0.32 - state.pointer.y * 0.16, 3, dt);
  });

  return (
    <group ref={group} position={[0, 0.2, 0]}>
      {LAYERS.map((layer, i) => {
        const isActive = i === active;
        const y = (LAYERS.length / 2 - i) * 0.78;
        return (
          <group key={layer.name} position={[isActive ? 0.55 : 0, y, 0]}>
            <RoundedBox args={[4.2, 0.34, 3]} radius={0.06} smoothness={4}>
              <meshPhysicalMaterial
                color="#080D18"
                emissive={layer.color}
                emissiveIntensity={isActive ? 0.55 : 0.12}
                metalness={0.85}
                roughness={0.3}
                clearcoat={1}
              />
            </RoundedBox>
            <RoundedBox args={[4.24, 0.36, 3.04]} radius={0.06} smoothness={2}>
              <meshBasicMaterial
                color={layer.color}
                wireframe
                transparent
                opacity={isActive ? 0.4 : 0.09}
              />
            </RoundedBox>
            <Billboard position={[2.9, 0, 0]}>
              <Text
                fontSize={0.2}
                color={isActive ? layer.color : '#5B6A8C'}
                anchorX="left"
                outlineWidth={0.004}
                outlineColor="#04060C"
              >
                {layer.name}
              </Text>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
}

export function Stack() {
  const [active, setActive] = useState(0);

  return (
    <section id="stack" className="relative overflow-hidden py-28 sm:py-36">
      <div className="shell relative z-10">
        <SectionHeading
          status="Engineering"
          title="What it is actually made of"
          lede="Five layers, each replaceable on its own. The model provider, the vector store and every connector sit behind interfaces, so swapping one does not touch the other four."
        />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="relative order-2 h-[420px] sm:h-[500px] lg:order-1">
            <SceneCanvas
              label="stack"
              fallback={<SceneFallback variant="field" />}
              camera={{ position: [0, 0.5, 8.4], fov: 40 }}
            >
              <StageLights />
              <StackScene active={active} />
              <ContactShadows
                position={[0, -2.6, 0]}
                opacity={0.45}
                scale={12}
                blur={3}
                far={4}
                color="#000000"
              />
            </SceneCanvas>
          </div>

          <div className="order-1 space-y-2 lg:order-2">
            {LAYERS.map((layer, i) => (
              <Reveal key={layer.name} delay={i * 0.05}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  className={
                    active === i
                      ? 'w-full rounded-2xl border border-white/20 bg-white/[0.05] p-5 text-left transition-all'
                      : 'w-full rounded-2xl border border-white/8 p-5 text-left transition-all hover:border-white/20'
                  }
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: layer.color, opacity: active === i ? 1 : 0.4 }}
                    />
                    <h3 className="font-display text-lg text-cream">{layer.name}</h3>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {layer.items.map((item) => (
                      <span
                        key={item}
                        className="rounded-lg border border-white/10 bg-ink/60 px-2.5 py-1 font-mono text-[0.68rem] text-ash/75"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                  {active === i && (
                    <p className="mt-3 text-xs leading-relaxed text-ash/65">{layer.note}</p>
                  )}
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
