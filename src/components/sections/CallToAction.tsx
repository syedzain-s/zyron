'use client';

import Link from 'next/link';
import { Terminal } from 'lucide-react';
import { SceneCanvas } from '@/components/three/SceneCanvas';
import { ZyronCore } from '@/components/three/ZyronCore';
import { ParticleField } from '@/components/three/ParticleField';
import { StageLights } from '@/components/three/StageLights';
import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';

export function CallToAction() {
  return (
    <section className="relative flex min-h-[80svh] items-center overflow-hidden">
      <div className="absolute inset-0">
        <SceneCanvas label="cta" camera={{ position: [0, 0, 7.6] }}>
          <StageLights />
          <ParticleField count={700} radius={13} parallax={0.4} />
          <ZyronCore intensity={0.5} scale={1.3} />
        </SceneCanvas>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_50%,rgba(8,6,5,0.84),rgba(8,6,5,0.34))]" />

      <div className="shell relative z-10 text-center">
        <Reveal>
          <h2 className="mx-auto max-w-[18ch] font-display text-display-lg text-balance">
            Stop managing. Start directing.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-[54ch] text-lg leading-relaxed text-ash/80">
            Open the console and give ZYRON something real — a message to send, a
            contract to read, a day to rebuild.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="mt-10 flex justify-center">
            <Link href="/console">
              <Button
                icon={<Terminal className="h-4 w-4" />}
                className="px-8 py-4 text-[0.72rem] font-semibold uppercase tracking-[0.18em]"
              >
                Issue a Command
              </Button>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
