'use client';

import { useState } from 'react';
import * as THREE from 'three';
import { Lock, RotateCcw } from 'lucide-react';
import { SceneCanvas } from '@/components/three/SceneCanvas';
import { SceneFallback } from '@/components/three/SceneFallback';
import { DataConduit } from '@/components/three/DataConduit';
import { ParticleField } from '@/components/three/ParticleField';
import { StageLights } from '@/components/three/StageLights';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { ApprovalCard } from '@/components/ui/ApprovalCard';
import { Reveal } from '@/components/ui/Reveal';
import { Button } from '@/components/ui/Button';
import type { ApprovalRequest } from '@/types';

const SAMPLE: ApprovalRequest = {
  id: 'demo-1',
  moduleCode: 'CMS',
  moduleName: 'Communication Proxy',
  action: 'Send a WhatsApp message and a calendar invite',
  target: 'Alex Warner — client',
  payload:
    'Thursday 3:00 PM works. I have held 45 minutes and sent the invite — shout if you need the earlier slot instead.',
  risk: 'approval',
  createdAt: Date.now(),
  status: 'pending',
};

const RULES = [
  { label: 'Money leaving an account', verdict: 'Always asks' },
  { label: 'A message to another human', verdict: 'Always asks' },
  { label: 'Anything published in public', verdict: 'Always asks' },
  { label: 'Cancelling something on your calendar', verdict: 'Always asks' },
  { label: 'Reading, sorting, drafting, analysing', verdict: 'Runs alone' },
  { label: 'Releasing the continuity package', verdict: 'Dual confirm' },
];

export function ApprovalGate() {
  const [request, setRequest] = useState<ApprovalRequest>(SAMPLE);

  const resolve = (_id: string, status: ApprovalRequest['status'], payload?: string) =>
    setRequest((prev) => ({ ...prev, status, payload: payload ?? prev.payload }));

  const open = request.status === 'approved' || request.status === 'edited';

  return (
    <section id="approval" className="relative overflow-hidden py-28 sm:py-36">
      <div className="absolute inset-0">
        <SceneCanvas
          label="approval-conduit"
          fallback={<SceneFallback variant="field" />}
          camera={{ position: [0, 0.2, 9] }}
        >
          <StageLights env={false} />
          <ParticleField count={420} radius={14} color="#C8A44D" size={0.02} parallax={0.25} />
          <DataConduit
            from={new THREE.Vector3(-4.6, -1.2, 0)}
            to={new THREE.Vector3(4.6, -1.2, 0)}
            bow={2.1}
            gateOpen={open}
            color={open ? '#5B6A8C' : '#C8A44D'}
          />
        </SceneCanvas>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_40%,rgba(8,6,5,0.90),transparent)]" />

      <div className="shell relative z-10">
        <SectionHeading
          align="center"
          status={open ? 'Gate open — dispatching' : 'Gate closed — packets queued'}
          title="Autonomy stops here, on purpose"
          lede="ZYRON will read anything and decide anything. It will not send, spend, publish or cancel until you say so. Watch the packets below: they queue at the ring until this card is answered."
        />

        <div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <Reveal>
            <div className="preserve-3d [perspective:1200px]">
              <ApprovalCard request={request} onResolve={resolve} />
              {request.status !== 'pending' && (
                <div className="mt-4">
                  <Button
                    variant="quiet"
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                    onClick={() => setRequest({ ...SAMPLE, createdAt: Date.now() })}
                    className="px-0"
                  >
                    Reset the demo
                  </Button>
                </div>
              )}
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="panel p-6">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-gold" />
                <h3 className="text-sm font-medium text-cream">The standing rules</h3>
              </div>
              <ul className="mt-5 divide-y divide-white/5">
                {RULES.map((rule) => (
                  <li key={rule.label} className="flex items-center justify-between gap-4 py-3">
                    <span className="text-sm text-ash/85">{rule.label}</span>
                    <span
                      className={
                        rule.verdict === 'Runs alone'
                          ? 'shrink-0 font-mono text-[0.65rem] text-signal-ok'
                          : rule.verdict === 'Dual confirm'
                            ? 'shrink-0 font-mono text-[0.65rem] text-signal-risk'
                            : 'shrink-0 font-mono text-[0.65rem] text-gold'
                      }
                    >
                      {rule.verdict}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs leading-relaxed text-ash/55">
                Rules live in configuration, not in a prompt. Changing one is an audited event.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
