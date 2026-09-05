/**
 * Not every machine an examiner or a visitor uses can give us a WebGL context.
 * Hardware acceleration gets switched off, drivers get blocklisted, and every
 * browser caps how many live contexts a page may hold. Detect it once, cache
 * the answer, and let the caller render something else.
 */

let cached: boolean | null = null;

export function detectWebGL(): boolean {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl');

    cached = Boolean(gl);

    // Release the probe context immediately — browsers count it against the
    // per-page limit, and this page opens several real ones.
    if (gl && 'getExtension' in gl) {
      (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    cached = false;
  }

  return cached;
}

/** Reason string shown in the console once, to help anyone debugging a demo machine. */
export function warnNoWebGL(source: string) {
  if (typeof window === 'undefined') return;
  console.warn(
    `[zyron] ${source}: no WebGL context available. Falling back to the flat layer. ` +
      'Check hardware acceleration in your browser settings, or visit chrome://gpu.',
  );
}
