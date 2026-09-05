'use client';

import { cn } from '@/lib/utils';

/**
 * What every 3D section renders when WebGL is unavailable or reduced motion is
 * on. Pure CSS: a soft light source and a hairline sphere, matching the gold
 * and cocoa palette so the page still looks composed rather than broken.
 */
export function SceneFallback({
  variant = 'orb',
  className,
}: {
  variant?: 'orb' | 'field';
  className?: string;
}) {
  if (variant === 'field') {
    return (
      <div className={cn('absolute inset-0 overflow-hidden', className)} aria-hidden="true">
        <div className="absolute inset-0 hairline-grid opacity-30" />
        <div className="absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cocoa/10 blur-[120px]" />
      </div>
    );
  }

  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)} aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-[min(46vmin,320px)] w-[min(46vmin,320px)]">
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(217,164,65,0.50),rgba(51,32,15,0.40)_55%,transparent_74%)] blur-[2px]" />
          <div className="absolute inset-0 animate-breathe rounded-full bg-cocoa/20 blur-[70px]" />
          <div className="absolute inset-[-14%] rounded-full border border-gold/25" />
          <div className="absolute inset-[-26%] rounded-full border border-cocoa/15" />
          <div className="absolute inset-[8%] rounded-full border border-white/5" />
        </div>
      </div>
    </div>
  );
}
