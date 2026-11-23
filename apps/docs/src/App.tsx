import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { ChartsEngineProvider, setReducedMotionPolicy, systemPrefersReducedMotion } from '@rsc-gl/react';
import { RenderEngine } from '@rsc-gl/core';
import { SiteContext, type SiteSettings } from './components/docs';
import { ROUTES, type RouteDef } from './routes';

function usePath() {
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path;
}

export function navigate(to: string) {
  history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

/** Intercept same-origin link clicks for client-side navigation. */
function useLinkInterception() {
  useEffect(() => {
    const on = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('/')) return;
      e.preventDefault();
      navigate(href);
    };
    document.addEventListener('click', on);
    return () => document.removeEventListener('click', on);
  }, []);
}

function Toc({ path }: { path: string }) {
  const [items, setItems] = useState<{ id: string; text: string; level: number }[]>([]);
  const [active, setActive] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      const hs = [...document.querySelectorAll<HTMLElement>('.content [data-toc]')];
      setItems(hs.map((h) => ({ id: h.id, text: h.firstChild?.textContent ?? '', level: h.dataset.level === '3' ? 3 : 2 })));
    }, 50);
    return () => clearTimeout(t);
  }, [path]);
  useEffect(() => {
    const on = () => {
      let cur = '';
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top < 120) cur = it.id;
      }
      setActive(cur);
    };
    window.addEventListener('scroll', on, { passive: true });
    on();
    return () => window.removeEventListener('scroll', on);
  }, [items]);
  if (!items.length) return <aside className="toc" />;
  return (
    <aside className="toc">
      <div className="toc-title">Contents</div>
      {items.map((it) => (
        <a key={it.id} href={`#${it.id}`} data-active={active === it.id} style={{ paddingLeft: it.level === 3 ? 22 : 10 }}>
          {it.text}
        </a>
      ))}
    </aside>
  );
}

function Fps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frames++;
      if (now - last > 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span className="pill" title="Page frame rate">
      {fps} fps
    </span>
  );
}

export function App() {
  const path = usePath();
  useLinkInterception();
  const [scheme, setScheme] = useState<'light' | 'dark'>(() => (localStorageGet('scheme') as 'light' | 'dark') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [backend, setBackend] = useState<'auto' | 'webgpu' | 'webgl2'>(() => (localStorageGet('backend') as 'auto') ?? 'auto');
  const [activeBackend, setActiveBackend] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Charts honour the OS reduced-motion setting; the docs let readers override it.
  const reducedMotion = useMemo(() => systemPrefersReducedMotion(), []);
  const [forceMotion, setForceMotion] = useState(() => localStorageGet('motion') === 'force');
  setReducedMotionPolicy(forceMotion ? 'ignore' : 'respect');
  useEffect(() => localStorageSet('motion', forceMotion ? 'force' : 'system'), [forceMotion]);

  useEffect(() => {
    document.documentElement.dataset.theme = scheme;
    localStorageSet('scheme', scheme);
  }, [scheme]);
  useEffect(() => localStorageSet('backend', backend), [backend]);

  const site: SiteSettings = useMemo(
    () => ({ scheme, backend, setScheme, setBackend, activeBackend, reportBackend: setActiveBackend }),
    [scheme, backend, activeBackend],
  );

  const route = ROUTES.find((r) => r.path === path) ?? ROUTES.find((r) => r.path === '/')!;
  const Comp = route.component as ComponentType;
  const groups = useMemo(() => {
    const g = new Map<string, RouteDef[]>();
    for (const r of ROUTES) {
      if (query && !r.title.toLowerCase().includes(query.toLowerCase())) continue;
      if (!g.has(r.group)) g.set(r.group, []);
      g.get(r.group)!.push(r);
    }
    return g;
  }, [query]);

  // Charts report the backend they ended up on.
  useEffect(() => {
    const t = setInterval(() => {
      const preferred = backend === 'auto' ? undefined : backend;
      for (const e of RenderEngine.all()) if (e.backend && (!preferred || e.backend === preferred)) setActiveBackend(e.backend);
    }, 500);
    return () => clearInterval(t);
  }, [backend]);

  return (
    <SiteContext.Provider value={site}>
      <ChartsEngineProvider prefer={backend === 'auto' ? undefined : backend}>
        <header className="topbar">
          <a className="brand" href="/">
            <span className="brand-logo" aria-hidden />
            RSC-GL Charts
          </a>
          <span className="version">v0.1 · preview</span>
          <span className="topbar-spacer" />
          <input className="search" placeholder="Search docs…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search documentation" />
          <span className="pill" data-ok={!!activeBackend} title="GPU backend in use">
            {activeBackend ? activeBackend.toUpperCase() : 'GPU…'}
          </span>
          {reducedMotion && (
            <button
              className="pill"
              data-ok={forceMotion}
              onClick={() => setForceMotion((f) => !f)}
              title="Your operating system asks apps to reduce motion, so charts skip their animations. Click to animate anyway."
            >
              {forceMotion ? 'Animations: on' : 'Reduced motion: animate anyway?'}
            </button>
          )}
          <Fps />
          <div className="seg" role="group" aria-label="Rendering backend">
            {(['auto', 'webgpu', 'webgl2'] as const).map((b) => (
              <button key={b} aria-pressed={backend === b} onClick={() => setBackend(b)}>
                {b === 'auto' ? 'Auto' : b === 'webgpu' ? 'WebGPU' : 'WebGL2'}
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={() => setScheme(scheme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode">
            {scheme === 'dark' ? '☀' : '☾'}
          </button>
        </header>
        <div className="shell">
          <nav className="sidebar" aria-label="Documentation">
            {[...groups].map(([group, routes]) => (
              <div className="nav-group" key={group}>
                <div className="nav-title">{group}</div>
                {routes.map((r) => (
                  <a key={r.path} className="nav-link" href={r.path} aria-current={r.path === route.path ? 'page' : undefined}>
                    {r.title}
                    {r.badge && (
                      <span className="badge" data-kind={r.badge.toLowerCase()}>
                        {r.badge}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            ))}
          </nav>
          <main className="content" key={`${route.path}|${backend}|${forceMotion}`}>
            <Comp />
          </main>
          <Toc path={route.path} />
        </div>
      </ChartsEngineProvider>
    </SiteContext.Provider>
  );
}

function localStorageGet(k: string): string | null {
  try {
    return localStorage.getItem(`rscgl-docs-${k}`);
  } catch {
    return null;
  }
}

function localStorageSet(k: string, v: string) {
  try {
    localStorage.setItem(`rscgl-docs-${k}`, v);
  } catch {
    /* storage unavailable */
  }
}
