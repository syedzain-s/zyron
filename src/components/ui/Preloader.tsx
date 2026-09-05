'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const BOOT = [
  'Mounting orchestrator',
  'Linking 23 modules',
  'Restoring memory graph',
  'Arming approval gate',
];

/**
 * The one orchestrated motion moment on the page. It doubles as an honest
 * loading window while the first WebGL context compiles its shaders.
 */
export function Preloader() {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDone(true);
      return;
    }
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      setProgress((p) => {
        const next = Math.min(p + Math.random() * 16 + 6, 100);
        if (next >= 100) window.clearInterval(id);
        return next;
      });
      if (frame > 40) window.clearInterval(id);
    }, 130);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (progress >= 100) {
      const t = window.setTimeout(() => setDone(true), 420);
      return () => window.clearTimeout(t);
    }
  }, [progress]);

  const stage = BOOT[Math.min(Math.floor(progress / 26), BOOT.length - 1)];

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          exit={{ opacity: 0, filter: 'blur(12px)' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[100] grid place-items-center bg-ink"
        >
          <div className="w-[min(420px,80vw)]">
            <div className="mb-6 flex items-baseline justify-between">
              <span className="font-display text-2xl tracking-[0.3em] text-cream">ZYRON</span>
              <span className="font-mono text-xs text-gold">{Math.floor(progress)}%</span>
            </div>
            <div className="h-px w-full bg-white/10">
              <motion.div
                className="h-px bg-gold"
                style={{ width: `${progress}%` }}
                transition={{ ease: 'linear' }}
              />
            </div>
            <p className="mt-4 font-mono text-xs text-ash/60">{stage}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
