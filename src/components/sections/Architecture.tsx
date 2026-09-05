'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SceneCanvas } from '@/components/three/SceneCanvas';
import { SceneFallback } from '@/components/three/SceneFallback';
import { OrbitLattice, type LatticeNode } from '@/components/three/OrbitLattice';
import { ParticleField } from '@/components/three/ParticleField';
import { StageLights } from '@/components/three/StageLights';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { MODULES, getModule } from '@/lib/modules';

const LAYERS = [
  {
    name: 'Input handler',
    detail: 'Voice notes, WhatsApp, mail, wearables, IoT and the web console all land here as one normalised event.',
  },
  {
    name: 'Master orchestrator',
    detail: 'Classifies intent, plans the steps, and picks which sub-agents to wake. Nothing runs without a plan it can explain.',
  },
  {
    name: 'Sub-agent swarm',
    detail: 'Twenty-three specialists. Each owns its data sources, its tools and its own definition of done.',
  },
  {
    name: 'Knowledge graph and vector memory',
    detail: 'Entities and relationships in the graph, meaning and recall in the vectors. Every module reads and writes here.',
  },
  {
    name: 'Approval gate',
    detail: 'The last stop before the outside world. Send, spend, cancel and publish all queue here for one tap.',
  },
];

export function Architecture() {
  const [focus, setFocus] = useState<string | null>(null);

  const nodes: LatticeNode[] = useMemo(
    () => MODULES.map((m) => ({ code: m.code, label: m.name, tier: m.tier })),
    [],
  );

  const focused = focus ? getModule(focus) : null;

  return (
    <section id="architecture" className="relative overflow-hidden py-28 sm:py-36">
      <div className="pointer-events-none absolute inset-0 hairline-grid mask-fade-b opacity-40" />

      <div className="shell relative z-10">
        <SectionHeading
          status="Layer map"
          title="One brain, twenty-three hands"
          lede="Requests do not go to a model and hope for the best. They are classified, planned, routed to the specialists that own the relevant data, and reassembled into a single answer or a single action."
        />
      </div>

      <div className="relative mt-4 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="shell lg:pr-0">
          <ol className="relative space-y-1">
            {LAYERS.map((layer, i) => (
              <Reveal key={layer.name} delay={i * 0.06}>
                <li className="group relative flex gap-5 rounded-2xl px-4 py-5 transition-colors hover:bg-white/[0.03]">
                  <div className="flex flex-col items-center">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-gold/40 font-mono text-[0.7rem] text-gold">
                      {i + 1}
                    </span>
                    {i < LAYERS.length - 1 && (
                      <span className="mt-2 w-px flex-1 bg-gradient-to-b from-gold/30 to-transparent" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-display text-lg text-cream">{layer.name}</h3>
                    <p className="mt-1.5 max-w-[46ch] text-sm leading-relaxed text-ash/70">
                      {layer.detail}
                    </p>
                  </div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>

        <div className="relative h-[520px] sm:h-[620px]">
          <SceneCanvas
            label="architecture"
            fallback={<SceneFallback variant="field" />}
            camera={{ position: [0, 1.2, 10], fov: 42 }}
          >
            <StageLights env={false} />
            <ParticleField count={500} radius={12} color="#C8A44D" size={0.02} parallax={0.2} />
            <OrbitLattice nodes={nodes} onFocus={setFocus} />
          </SceneCanvas>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-6 pb-4">
            <AnimatePresence mode="wait">
              {focused ? (
                <motion.div
                  key={focused.code}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22 }}
                  className="panel max-w-md p-4"
                >
                  <div className="flex items-center gap-2">
                    <focused.icon className="h-4 w-4 text-gold" />
                    <span className="text-sm font-medium text-cream">{focused.name}</span>
                    <span className="ml-auto font-mono text-[0.65rem] text-ash/50">
                      {focused.code}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-ash/75">{focused.functionality}</p>
                </motion.div>
              ) : (
                <motion.p
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="data-label"
                >
                  Hover a node to identify the sub-agent
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
