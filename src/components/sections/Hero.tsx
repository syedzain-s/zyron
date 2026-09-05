'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowDown, Terminal } from 'lucide-react';
import { SceneCanvas } from '@/components/three/SceneCanvas';
import { ZyronCore } from '@/components/three/ZyronCore';
import { ParticleField } from '@/components/three/ParticleField';
import { GridFloor } from '@/components/three/GridFloor';
import { StageLights } from '@/components/three/StageLights';
import { Button } from '@/components/ui/Button';
import { formatClock } from '@/lib/utils';

const TELEMETRY = [
  { k: 'Modules online', v: '23 / 23' },
  { k: 'Open commitments', v: '11' },
  { k: 'Awaiting your call', v: '2' },
];

export function Hero() {
  const section = useRef<HTMLElement>(null);
  const [intensity, setIntensity] = useState(0.3);
  const [clock, setClock] = useState('--:--:--');

  const { scrollYProgress } = useScroll({
    target: section,
    offset: ['start start', 'end start'],
  });

  // Copy drifts up and dissolves as the core is pulled deeper into the scene.
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, 1.35]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatClock(new Date())), 1000);
    setClock(formatClock(new Date()));
    return () => window.clearInterval(id);
  }, []);

  return (
    <section
      ref={section}
      onPointerMove={() => setIntensity(0.75)}
      onPointerLeave={() => setIntensity(0.3)}
      className="relative flex min-h-[100svh] items-center overflow-hidden pt-28"
    >
      <motion.div style={{ scale: sceneScale }} className="absolute inset-0">
        <SceneCanvas label="hero" lazy={false} camera={{ position: [0, 0.4, 7.2], fov: 45 }}>
          <StageLights />
          <ParticleField count={1100} radius={16} parallax={0.5} />
          <GridFloor y={-3.4} />
          <ZyronCore intensity={intensity} scale={1.05} position={[2.1, 0.15, 0]} />
        </SceneCanvas>
      </motion.div>

      {/* Vignette keeps the type legible over the scene at every breakpoint. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_45%,rgb(4_6_12/0.95)_18%,rgb(4_6_12/0.42)_56%,transparent_80%)]" />

      <motion.div
        style={{ y: copyY, opacity: copyOpacity }}
        className="shell relative z-10 grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]"
      >
        <div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="mb-9 inline-flex items-center gap-3.5 rounded-full border border-[var(--line-strong)] bg-[var(--glass)] px-5 py-2 backdrop-blur-md"
          >
            <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-gold" />
            <span className="eyebrow">Orchestrator live</span>
            <span className="h-3 w-px bg-[var(--line-strong)]" />
            <span className="font-mono text-[0.7rem] text-ash">{clock}</span>
          </motion.div>

          {/* Gold is spent on the subject only. The rest of the headline stays
              in warm white so the metal still reads as emphasis. */}
          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-display-xl text-balance text-cream"
          >
            <span className="gold-text">Your authority,</span>
            <br />
            <span className="display-3d">
              running while
              <br />
              you sleep.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.35, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="mt-9 max-w-[58ch] text-[1.0625rem] leading-[1.75] text-ash"
          >
            ZYRON is a personal chief of staff, not a chat window. Twenty-three
            modules read your mail, calendar, contracts, money and health, decide
            what needs doing, and do it — stopping at one gate for anything that
            touches the outside world.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5, duration: 0.8 }}
            className="mt-11 flex flex-wrap items-center gap-3"
          >
            <Link href="/console">
              <Button icon={<Terminal className="h-4 w-4" />}>Give it a command</Button>
            </Link>
            <Link href="#architecture">
              <Button variant="ghost">See how it routes</Button>
            </Link>
          </motion.div>

          {/* Divided by gold hairlines rather than boxed into cards — the
              numbers are one row of facts, not three separate objects. */}
          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.7, duration: 1 }}
            className="mt-16 max-w-xl"
          >
            <div className="hairline" />
            <div className="grid grid-cols-3">
              {TELEMETRY.map((item, i) => (
                <div
                  key={item.k}
                  className={
                    i > 0
                      ? 'border-l border-[var(--line)] py-5 pl-5'
                      : 'py-5 pr-5'
                  }
                >
                  <dd className="font-display text-2xl text-cream">{item.v}</dd>
                  <dt className="mt-1.5 text-[0.72rem] leading-tight text-ash">{item.k}</dt>
                </div>
              ))}
            </div>
            <div className="hairline" />
          </motion.dl>
        </div>

        <div aria-hidden className="hidden lg:block" />
      </motion.div>

      <motion.a
        href="#architecture"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.1, duration: 1 }}
        style={{ opacity: copyOpacity }}
        className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2.5 text-ash transition-colors hover:text-gold"
      >
        <span className="eyebrow text-ash">Scroll</span>
        <ArrowDown className="h-4 w-4 animate-bounce" />
      </motion.a>
    </section>
  );
}
