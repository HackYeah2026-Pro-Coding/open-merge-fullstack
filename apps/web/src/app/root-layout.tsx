import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { env } from '@/lib/env';
import { Footer } from '@/components/layout/footer';
import { TopBar } from '@/components/layout/top-bar';
import { MockPanel } from '@/components/layout/mock-panel';

/** Scrolls to #anchors after navigation; ScrollRestoration handles everything else. */
function useHashScroll() {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const frame = requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [hash, pathname]);
}

export function RootLayout() {
  useHashScroll();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-sm bg-fg px-3 py-2 text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <TopBar />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      {env.apiMode === 'mock' && <MockPanel />}
      <ScrollRestoration />
    </div>
  );
}
