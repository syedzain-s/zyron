import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Reveal } from './Reveal';

/**
 * Every section opens the same way: a gold eyebrow, a fading hairline, then
 * the serif heading. The repetition is the point — once a reader learns that
 * shape, they can find their place on the page without reading anything.
 *
 * The eyebrow carries a live status string rather than a decorative label, so
 * the structural device is also information: it says what the system is doing
 * in this part of the page.
 */
export function SectionHeading({
  title,
  lede,
  status,
  align = 'left',
  className,
}: {
  title: ReactNode;
  lede?: ReactNode;
  status?: string;
  align?: 'left' | 'center';
  className?: string;
}) {
  const centered = align === 'center';

  return (
    <div className={cn('mb-16', centered && 'text-center', className)}>
      {status && (
        <Reveal>
          <div className={cn('flex items-center gap-3.5', centered && 'justify-center')}>
            {/* A live mark, not a bullet — it pulses because the system is on. */}
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold" />
            </span>
            <span className="eyebrow">{status}</span>
            {/* The rule runs out from the label and dissolves, so the eyebrow
                reads as the start of a line rather than a floating tag. */}
            {!centered && (
              <span
                aria-hidden="true"
                className="h-px min-w-0 flex-1 bg-gradient-to-r from-[var(--line-strong)] to-transparent"
              />
            )}
          </div>
        </Reveal>
      )}

      <Reveal delay={0.05}>
        <h2
          className={cn(
            'font-display text-display-md text-balance text-cream',
            status ? 'mt-7' : '',
          )}
        >
          {title}
        </h2>
      </Reveal>

      {lede && (
        <Reveal delay={0.12}>
          {/* Serif body needs a longer measure and more leading than a sans.
              62ch was set for the old geometric face and now runs short. */}
          <p
            className={cn(
              'mt-6 max-w-[68ch] text-[1.0625rem] leading-[1.7] text-ash',
              centered && 'mx-auto',
            )}
          >
            {lede}
          </p>
        </Reveal>
      )}
    </div>
  );
}
