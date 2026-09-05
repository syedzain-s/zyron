'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { cn } from '@/lib/utils';
import { MODULES } from '@/lib/modules';

const TIMELINE = [
  { time: '05:40', code: 'BRF', line: 'Briefing built. Two meetings collide at 14:00 — the smaller one is moved.' },
  { time: '07:15', code: 'BIO', line: 'HRV down 18% on four hours of sleep. Afternoon deep work is pushed to tomorrow.' },
  { time: '09:52', code: 'DSR', line: 'Dossier filed for the 10:00. Last call ended on a pricing objection that was never answered.' },
  { time: '11:04', code: 'CLT', line: 'You promised the revised deck by Tuesday. Logged, with a Monday nudge.' },
  { time: '13:20', code: 'FIN', line: 'A design tool has billed twice this month. Cancellation drafted, waiting on you.' },
  { time: '15:38', code: 'PSG', line: 'Traffic adds 22 minutes to the airport run. The 17:00 call is shifted and Alex is told.' },
  { time: '18:02', code: 'DOC', line: 'The vendor contract auto-renews in 11 days with a 90-day notice window. Flagged.' },
  { time: '21:30', code: 'DJB', line: 'Today you said yes to a deal in under four minutes. That is the third time this quarter.' },
];

/**
 * The proof section. Abstract module descriptions do not land; one day of
 * concrete output does.
 */
export function DayInTheLife() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-120px' });
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const id = window.setInterval(() => {
      setRevealed((n) => {
        if (n >= TIMELINE.length) {
          window.clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, 420);
    return () => window.clearInterval(id);
  }, [inView]);

  return (
    <section className="relative overflow-hidden py-28 sm:py-36">
      <div className="shell relative z-10">
        <SectionHeading
          status="One ordinary Tuesday"
          title="What it actually produced today"
          lede="No screenshots of a chat window. This is the log — every line is a module acting on its own inputs, in order, without being asked."
        />

        <div ref={ref} className="relative mx-auto max-w-3xl">
          <div className="absolute left-[4.6rem] top-2 h-full w-px bg-gradient-to-b from-gold/40 via-white/10 to-transparent sm:left-[5.4rem]" />

          {TIMELINE.map((entry, i) => {
            const mod = MODULES.find((m) => m.code === entry.code);
            const shown = i < revealed;
            return (
              <motion.div
                key={entry.time}
                initial={{ opacity: 0, x: -14 }}
                animate={shown ? { opacity: 1, x: 0 } : { opacity: 0, x: -14 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="relative flex gap-5 py-4 sm:gap-7"
              >
                <span className="w-14 shrink-0 pt-0.5 text-right font-mono text-xs text-ash/50 sm:w-16">
                  {entry.time}
                </span>
                <span
                  className={cn(
                    'relative z-10 mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border bg-ink',
                    shown ? 'border-gold/60' : 'border-white/10',
                  )}
                >
                  {mod && <mod.icon className="h-3 w-3 text-gold" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-cream/90">{entry.line}</p>
                  <span className="mt-1 block font-mono text-[0.65rem] text-ash/40">
                    {entry.code} · {mod?.name}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
