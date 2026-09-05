'use client';

import { motion } from 'framer-motion';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'ghost' | 'quiet' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: ReactNode;
  full?: boolean;
}

const styles: Record<Variant, string> = {
  primary:
    'bg-gold text-ink hover:bg-gold-soft shadow-[0_18px_50px_-24px_rgba(227,179,65,0.9)]',
  ghost:
    'border border-white/15 bg-white/[0.04] text-cream hover:border-gold/45 hover:bg-white/[0.07]',
  quiet: 'text-ash hover:text-cream',
  danger:
    'border border-signal-risk/35 bg-signal-risk/10 text-signal-risk hover:bg-signal-risk/20',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', icon, full, className, children, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(
        'group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full px-6 py-3 text-sm font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40',
        styles[variant],
        full && 'w-full',
        className,
      )}
      {...(rest as object)}
    >
      {variant === 'primary' && (
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/45 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      )}
      {icon}
      <span className="relative">{children}</span>
    </motion.button>
  );
});
