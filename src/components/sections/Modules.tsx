'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { SceneCanvas } from '@/components/three/SceneCanvas';
import { SceneFallback } from '@/components/three/SceneFallback';
import { Monolith } from '@/components/three/Monolith';
import { ContactShadows } from '@react-three/drei';
import { StageLights } from '@/components/three/StageLights';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { MODULES, TIERS } from '@/lib/modules';
import type { AgentModule, ModuleTier } from '@/types';
import { cn } from '@/lib/utils';

const TIER_ACCENT: Record<ModuleTier, string> = {
  core: '#ECD79F',
  extended: '#C8A44D',
  signature: '#5B6A8C',
};

const FILTERS: Array<{ key: ModuleTier | 'all'; label: string }> = [
  { key: 'all', label: 'All 23' },
  { key: 'core', label: 'Core operations' },
  { key: 'extended', label: 'Extended command' },
  { key: 'signature', label: 'Signature layer' },
];

export function Modules() {
  const [tier, setTier] = useState<ModuleTier | 'all'>('all');
  const [selected, setSelected] = useState<AgentModule>(MODULES[0]);
  const gridRef = useRef<HTMLDivElement>(null);

  /**
   * The register tilts toward the pointer. Written against CSS custom
   * properties and applied in a rAF so it never triggers a React re-render
   * while the mouse moves across twenty-three cards.
   */
  const onGridPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = gridRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty('--tilt-x', `${(-y * 5).toFixed(2)}deg`);
    el.style.setProperty('--tilt-y', `${(x * 6).toFixed(2)}deg`);
  };

  const onGridPointerLeave = () => {
    const el = gridRef.current;
    if (!el) return;
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
  };

  const visible = tier === 'all' ? MODULES : MODULES.filter((m) => m.tier === tier);

  return (
    <section id="modules" className="relative overflow-x-clip py-28 sm:py-36">
      <div className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-cocoa/[0.10] blur-[130px]" />

      <div className="shell relative z-10">
        <SectionHeading
          status="Module register"
          title="Every module owns a real job"
          lede="These are not feature bullets. Each module has its own inputs, its own autonomous action, and its own risk classification that decides whether it can act alone or has to ask."
        />

        <Reveal>
          <div className="mb-10 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setTier(f.key)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm transition-all duration-200',
                  tier === f.key
                    ? 'border-gold/50 bg-gold/12 text-gold'
                    : 'border-white/10 text-ash/70 hover:border-white/25 hover:text-cream',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-8">
          {/* Register list */}
          <div
            ref={gridRef}
            onPointerMove={onGridPointerMove}
            onPointerLeave={onGridPointerLeave}
            className="preserve-3d grid gap-3 [perspective:1600px] sm:grid-cols-2"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <AnimatePresence mode="popLayout">
              {visible.map((mod, i) => {
                const active = selected.code === mod.code;
                return (
                  <motion.button
                    key={mod.code}
                    layout
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.32, delay: Math.min(i * 0.015, 0.2) }}
                    onClick={() => setSelected(mod)}
                    onMouseEnter={() => setSelected(mod)}
                    className={cn(
                      'group relative overflow-hidden rounded-2xl border p-4 text-left transition-[border-color,background-color,box-shadow,transform] duration-300 will-change-transform',
                      active
                        ? 'border-gold/50 bg-gold/[0.09] shadow-[0_24px_50px_-24px_rgba(217,164,65,0.55)]'
                        : 'border-cream/10 bg-cream/[0.02] hover:border-gold/30',
                    )}
                    style={{
                      transform: `rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg)) translateZ(${
                        active ? 42 : 0
                      }px)`,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <mod.icon
                        className="mt-0.5 h-4 w-4 shrink-0"
                        style={{ color: TIER_ACCENT[mod.tier] }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-sm font-medium text-cream">{mod.name}</h3>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-ash/60">{mod.tagline}</p>
                      </div>
                      <span className="ml-auto shrink-0 font-mono text-[0.62rem] text-ash/40">
                        {mod.code}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Detail panel, anchored to a real object in space */}
          <div className="relative min-w-0 lg:sticky lg:top-28 lg:h-fit">
            <div className="relative h-[240px]">
              <SceneCanvas
                label="module-monolith"
                fallback={<SceneFallback variant="field" />}
                camera={{ position: [0, 0, 5.2], fov: 40 }}
              >
                <StageLights />
                <Monolith
                  color={TIER_ACCENT[selected.tier]}
                  active
                  rotationSeed={selected.id}
                />
                <ContactShadows
                  position={[0, -1.7, 0]}
                  opacity={0.55}
                  scale={7}
                  blur={2.6}
                  far={3}
                  color="#000000"
                />
              </SceneCanvas>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={selected.code}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="panel -mt-8 p-5 sm:-mt-10 sm:p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="rounded-full border px-2.5 py-0.5 font-mono text-[0.62rem]"
                    style={{
                      color: TIER_ACCENT[selected.tier],
                      borderColor: `${TIER_ACCENT[selected.tier]}55`,
                    }}
                  >
                    {TIERS[selected.tier].label}
                  </span>
                  <span className="font-mono text-[0.65rem] text-ash/45">
                    {String(selected.id).padStart(2, '0')} / 23
                  </span>
                </div>

                <h3 className="mt-4 font-display text-2xl text-cream">{selected.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ash/80">{selected.execution}</p>

                <div className="mt-6 space-y-4 border-t border-white/10 pt-5 text-sm">
                  <div>
                    <span className="data-label">Reads</span>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selected.inputs.map((input) => (
                        <span
                          key={input}
                          className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-ash/80"
                        >
                          {input}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="data-label">Does</span>
                    <p className="mt-1.5 text-cream/90">{selected.action}</p>
                  </div>
                  <div>
                    <span className="data-label">So that</span>
                    <p className="mt-1.5 flex items-start gap-1.5 text-cream/90">
                      <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                      {selected.benefit}
                    </p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
