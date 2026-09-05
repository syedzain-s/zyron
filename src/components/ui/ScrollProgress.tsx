'use client';

import { motion, useScroll, useSpring } from 'framer-motion';

/** A single hairline at the top of the viewport tracking read position. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const width = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: 0.001 });

  return (
    <motion.div
      style={{ scaleX: width }}
      className="fixed left-0 top-0 z-[60] h-px w-full origin-left bg-gradient-to-r from-gold via-cocoa to-gold"
    />
  );
}
