'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

const LINKS = [
  { href: '/#architecture', label: 'Architecture' },
  { href: '/#modules', label: 'Modules' },
  { href: '/#approval', label: 'Approval gate' },
  { href: '/#stack', label: 'Build' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-500',
        scrolled ? 'py-3' : 'py-6',
      )}
    >
      <nav
        className={cn(
          'shell flex items-center justify-between rounded-full transition-all duration-500',
          scrolled && 'border border-white/10 bg-ink/70 py-2.5 backdrop-blur-xl',
        )}
        style={scrolled ? { maxWidth: 'min(1100px, calc(100% - 2rem))' } : undefined}
      >
        <Link href="/" className="group flex items-center gap-3">
          <span className="relative grid h-8 w-8 place-items-center">
            <span className="absolute inset-0 rounded-full border border-gold/40" />
            <span className="absolute inset-1.5 rounded-full bg-cocoa/70 blur-[6px] transition-all group-hover:bg-gold/70" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-cream" />
          </span>
          <span className="font-display text-[0.95rem] font-semibold tracking-[0.22em] text-cream">
            ZYRON
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative text-sm text-ash/75 transition-colors hover:text-cream"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:block">
          <Link href="/console">
            <Button variant="ghost" icon={<Terminal className="h-4 w-4" />}>
              Open console
            </Button>
          </Link>
        </div>

        <button
          className="grid h-10 w-10 place-items-center rounded-full border border-white/10 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="shell mt-3 md:hidden"
          >
            <div className="panel flex flex-col gap-1 p-3">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-3 text-sm text-ash hover:bg-white/5 hover:text-cream"
                >
                  {link.label}
                </Link>
              ))}
              <Link href="/console" onClick={() => setOpen(false)} className="mt-2">
                <Button full icon={<Terminal className="h-4 w-4" />}>
                  Open console
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
