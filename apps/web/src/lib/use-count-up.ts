import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animates from the previous value (0 on mount) to `target` with an ease-out curve.
 * Returns the in-between value; callers format it and show the exact figure at rest.
 */
export function useCountUp(target: number, durationMs = 800): { value: number; done: boolean } {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const from = useRef(value);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      const next = t === 1 ? target : origin + (target - origin) * eased;
      from.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return { value, done: value === target };
}
