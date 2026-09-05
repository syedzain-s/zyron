'use client';

import { Canvas, type CanvasProps } from '@react-three/fiber';
import { AdaptiveDpr, AdaptiveEvents, Preload } from '@react-three/drei';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CanvasBoundary } from './CanvasBoundary';
import { SceneFallback } from './SceneFallback';
import { detectWebGL, warnNoWebGL } from './webgl';

interface SceneCanvasProps extends Omit<CanvasProps, 'children'> {
  children: ReactNode;
  className?: string;
  /** Only mount the WebGL context once the section is close to the viewport. */
  lazy?: boolean;
  /** What to render when 3D is unavailable. Defaults to the CSS orb. */
  fallback?: ReactNode;
  /** Shown in the console if this particular scene fails. */
  label?: string;
}

/**
 * Every 3D surface on the site goes through this wrapper so canvas settings,
 * device-pixel-ratio guarding, viewport-lazy mounting and failure handling
 * stay consistent — and so a page holding six scenes never breaks the page it
 * is decorating.
 */
export function SceneCanvas({
  children,
  className,
  lazy = true,
  fallback,
  label,
  camera,
  ...rest
}: SceneCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(!lazy);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const flat = fallback ?? <SceneFallback />;

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setAllowed(false);
      return;
    }
    const ok = detectWebGL();
    if (!ok) warnNoWebGL(label ?? 'scene');
    setAllowed(ok);
  }, [label]);

  useEffect(() => {
    if (!lazy || near || !host.current) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), {
      rootMargin: '300px',
    });
    io.observe(host.current);
    return () => io.disconnect();
  }, [lazy, near]);

  const mount = near && allowed === true;

  return (
    <div ref={host} className={cn('absolute inset-0', className)} aria-hidden="true">
      {mount ? (
        <CanvasBoundary fallback={flat} label={label}>
          <Canvas
            dpr={[1, 1.75]}
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: 'high-performance',
              // Let the browser hand back a software context rather than
              // throwing outright on machines with no usable GPU.
              failIfMajorPerformanceCaveat: false,
            }}
            camera={{ position: [0, 0, 6], fov: 42, near: 0.1, far: 100, ...(camera as object) }}
            {...rest}
          >
            <Suspense fallback={null}>
              {children}
              <Preload all />
            </Suspense>
            <AdaptiveDpr pixelated />
            <AdaptiveEvents />
          </Canvas>
        </CanvasBoundary>
      ) : (
        allowed === false && flat
      )}
    </div>
  );
}
