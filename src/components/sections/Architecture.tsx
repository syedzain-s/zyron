'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Reveal } from '@/components/ui/Reveal';
import { MODULES, TIERS, getModule } from '@/lib/modules';
import type { ModuleTier } from '@/types';
import { cn } from '@/lib/utils';

const LAYERS = [
  {
    name: 'Input handler',
    detail:
      'Voice notes, WhatsApp, mail, wearables and the web console all land here as one normalised event.',
  },
  {
    name: 'Master orchestrator',
    detail:
      'Classifies intent, plans the steps, and picks which sub-agents to wake. Nothing runs without a plan it can explain.',
  },
  {
    name: 'Sub-agent swarm',
    detail:
      'Twenty-three specialists. Each owns its data sources, its tools and its own definition of done.',
  },
  {
    name: 'Knowledge graph and memory',
    detail:
      'Entities and relationships in the graph, meaning and recall in the vectors. Every module reads and writes here.',
  },
  {
    name: 'Approval gate',
    detail:
      'The last stop before the outside world. Send, spend, cancel and publish all queue here for one tap.',
  },
];

const TIER_ORDER: ModuleTier[] = ['core', 'extended', 'signature'];

const TIER_DOT: Record<ModuleTier, string> = {
  core: 'bg-gold-soft',
  extended: 'bg-gold',
  signature: 'bg-cocoa-soft',
};

/**
 * The module map is plain HTML rather than a 3D scene.
 *
 * An orbiting node cloud looked impressive but told you nothing: you could not
 * read a name without hovering, and there was no way to see how the twenty-three
 * split across tiers. A ruled list does both at a glance, loads instantly, and
 * prints — which matters when this goes in a report.
 */
export function Architecture() {
  const [focus, setFocus] = useState<string | null>(null);
  const focused = focus ? getModule(focus) : null;

  const grouped = useMemo(
    () =>
      TIER_ORDER.map((tier) => ({
        tier,
        label: TIERS[tier].label,
        modules: MODULES.filter((m) => m.tier === tier),
      })),
    [],
  );

  return (
    <section id="architecture" className="relative overflow-hidden py-28 sm:py-36">
      <div className="pointer-events-none absolute inset-0 hairline-grid mask-fade-b opacity-30" />

      <div className="shell relative z-10">
        <SectionHeading
          status="Layer map"
          title="One brain, twenty-three hands"
          lede="Requests do not go to a model and hope for the best. They are classified, planned, routed to the specialists that own the relevant data, and reassembled into a single answer or a single action."
        />

        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          {/* The five layers a request passes through */}
          <div>
            <span className="eyebrow">How a request travels</span>
            <ol className="mt-7 space-y-1">
              {LAYERS.map((layer, i) => (
                <Reveal key={layer.name} delay={i * 0.06}>
                  <li className="group relative flex gap-5 rounded-2xl px-4 py-5 transition-colors hover:bg-cream/[0.03]">
                    <div className="flex flex-col items-center">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-gold/40 font-mono text-[0.7rem] text-gold">
                        {i + 1}
                      </span>
                      {i < LAYERS.length - 1 && (
                        <span className="mt-2 w-px flex-1 bg-gradient-to-b from-gold/30 to-transparent" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-display text-lg text-cream">{layer.name}</h3>
                      <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-ash">
                        {layer.detail}
                      </p>
                    </div>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>

          {/* The twenty-three specialists, grouped and readable */}
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="eyebrow">The twenty-three</span>
              <span className="font-mono text-[0.65rem] text-ash/60">hover to read</span>
            </div>

            <div className="mt-7 space-y-9">
              {grouped.map((group, gi) => (
                <Reveal key={group.tier} delay={gi * 0.08}>
                  <div>
                    <div className="flex items-center gap-3">
                      <span className={cn('h-1.5 w-1.5 rounded-full', TIER_DOT[group.tier])} />
                      <span className="font-mono text-[0.68rem] tracking-[0.14em] text-ash">
                        {group.label}
                      </span>
                      <span className="h-px flex-1 bg-[var(--line)]" />
                      <span className="font-mono text-[0.65rem] text-ash/50">
                        {group.modules.length}
                      </span>
                    </div>

                    <ul className="mt-3">
                      {group.modules.map((mod) => (
                        <li key={mod.code}>
                          <button
                            onMouseEnter={() => setFocus(mod.code)}
                            onFocus={() => setFocus(mod.code)}
                            onMouseLeave={() => setFocus(null)}
                            onBlur={() => setFocus(null)}
                            className={cn(
                              'flex w-full items-center gap-3.5 border-b border-[var(--line)] px-2 py-3 text-left transition-colors',
                              focus === mod.code ? 'bg-gold/[0.06]' : 'hover:bg-cream/[0.03]',
                            )}
                          >
                            <mod.icon
                              className={cn(
                                'h-4 w-4 shrink-0 transition-colors',
                                focus === mod.code ? 'text-gold' : 'text-ash/60',
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-cream">
                              {mod.name}
                            </span>
                            <span className="shrink-0 font-mono text-[0.62rem] text-ash/45">
                              {mod.code}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* Fixed-height so the column does not jump as descriptions change. */}
            <div className="mt-7 min-h-[5.5rem]">
              <AnimatePresence mode="wait">
                {focused ? (
                  <motion.div
                    key={focused.code}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="panel p-5"
                  >
                    <div className="flex items-center gap-2.5">
                      <focused.icon className="h-4 w-4 text-gold" />
                      <span className="text-sm font-semibold text-cream">{focused.name}</span>
                      <span className="ml-auto font-mono text-[0.65rem] text-ash/50">
                        {focused.code}
                      </span>
                    </div>
                    <p className="mt-2.5 text-sm leading-relaxed text-ash">
                      {focused.functionality}
                    </p>
                  </motion.div>
                ) : (
                  <motion.p
                    key="hint"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-2 text-sm leading-relaxed text-ash/60"
                  >
                    Every module owns its own data sources, its own tools, and its own definition
                    of done. Hover any one to see what it handles.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
