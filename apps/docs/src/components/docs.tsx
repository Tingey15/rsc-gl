import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from 'react';
import { highlight } from './highlight';

/* ------------------------------------------------------------------ site settings */

export interface SiteSettings {
  scheme: 'light' | 'dark';
  backend: 'auto' | 'webgpu' | 'webgl2';
  setScheme(s: 'light' | 'dark'): void;
  setBackend(b: 'auto' | 'webgpu' | 'webgl2'): void;
  activeBackend: string | null;
  reportBackend(b: string): void;
}

export const SiteContext = createContext<SiteSettings>(null as never);
export const useSite = () => useContext(SiteContext);

/* ------------------------------------------------------------------ page structure */

export function Page({ title, lede, children }: { title: string; lede?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · RSC-GL Charts`;
  }, [title]);
  return (
    <article>
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {children}
    </article>
  );
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export function H2({ children, id }: { children: string; id?: string }) {
  const s = id ?? slug(children);
  return (
    <h2 id={s} data-toc>
      {children}
      <a className="anchor" href={`#${s}`} aria-hidden>
        #
      </a>
    </h2>
  );
}

export function H3({ children, id }: { children: string; id?: string }) {
  const s = id ?? slug(children);
  return (
    <h3 id={s} data-toc data-level="3">
      {children}
    </h3>
  );
}

export function Callout({ kind = 'info', children }: { kind?: 'info' | 'warning'; children: ReactNode }) {
  return (
    <div className="callout" data-kind={kind}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ demo frame */

export function Demo({ title, code, children, bg, defaultOpen = false }: { title?: string; code?: string; children: ReactNode; bg?: 'soft'; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const [replay, setReplay] = useState(0);
  const clean = code ? stripDemoWrapper(code) : '';
  return (
    <div className="demo">
      <div className="demo-preview" data-bg={bg}>
        {/* Remounting recreates the charts, which replays their entrance animations. */}
        <Fragment key={replay}>{children}</Fragment>
      </div>
      <div className="demo-toolbar">
        <span className="title">{title}</span>
        <ReplayButton onReplay={() => setReplay((r) => r + 1)} />
        {code && (
          <>
            <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? 'Hide code' : 'Show code'}
            </button>
            <button
              className="btn"
              onClick={() => {
                navigator.clipboard?.writeText(clean);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </>
        )}
      </div>
      {code && open && (
        <pre className="code">
          <code>{highlight(clean)}</code>
        </pre>
      )}
    </div>
  );
}

export function ReplayButton({ onReplay }: { onReplay: () => void }) {
  return (
    <button className="btn" onClick={onReplay} title="Replay the entrance animation" aria-label="Replay animation">
      ↻ Replay
    </button>
  );
}

/** Demo source files share data helpers; show them as standalone examples. */
function stripDemoWrapper(code: string): string {
  return code
    .replace(/import \{ useDemoScheme \} from '[^']+';\n/g, '')
    .replace(/const scheme = useDemoScheme\(\);\n\s*/g, '')
    .replace(/\s*colorScheme=\{scheme\}/g, '')
    .replace(/colorScheme: scheme,?\s*/g, '')
    .trim();
}

/* ------------------------------------------------------------------ props table */

export interface PropRow {
  name: string;
  type: string;
  default?: string;
  description: ReactNode;
}

export function PropsTable({ rows }: { rows: PropRow[] }) {
  return (
    <table className="props">
      <thead>
        <tr>
          <th style={{ width: '20%' }}>Name</th>
          <th style={{ width: '30%' }}>Type</th>
          <th style={{ width: '14%' }}>Default</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td>
              <code>{r.name}</code>
            </td>
            <td>
              <code>{r.type}</code>
            </td>
            <td>{r.default ? <code>{r.default}</code> : '–'}</td>
            <td>{r.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ playground */

export type Knob =
  | { kind: 'range'; label: string; min: number; max: number; step?: number; value: number }
  | { kind: 'select'; label: string; options: string[]; value: string }
  | { kind: 'switch'; label: string; value: boolean };

export function Playground<K extends Record<string, Knob>>({
  knobs,
  render,
  code,
}: {
  knobs: K;
  render: (v: { [P in keyof K]: K[P]['value'] }) => ReactNode;
  code: (v: { [P in keyof K]: K[P]['value'] }) => string;
}) {
  const [values, setValues] = useState(() => Object.fromEntries(Object.entries(knobs).map(([k, v]) => [k, v.value])) as { [P in keyof K]: K[P]['value'] });
  const set = (k: string, v: unknown) => setValues((prev) => ({ ...prev, [k]: v }));
  const [replay, setReplay] = useState(0);
  return (
    <div className="demo">
      <div className="playground">
        <div className="demo-preview">
          <Fragment key={replay}>{render(values)}</Fragment>
        </div>
        <div className="knobs">
          <ReplayButton onReplay={() => setReplay((r) => r + 1)} />
          {Object.entries(knobs).map(([k, knob]) => (
            <div className="knob" key={k}>
              {knob.kind === 'range' && (
                <>
                  <label>
                    {knob.label} <span>{String(values[k])}</span>
                  </label>
                  <input type="range" min={knob.min} max={knob.max} step={knob.step ?? 1} value={values[k] as number} onChange={(e) => set(k, Number(e.target.value))} />
                </>
              )}
              {knob.kind === 'select' && (
                <>
                  <label>{knob.label}</label>
                  <select value={values[k] as string} onChange={(e) => set(k, e.target.value)}>
                    {knob.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </>
              )}
              {knob.kind === 'switch' && (
                <label className="switch">
                  {knob.label}
                  <input type="checkbox" checked={values[k] as boolean} onChange={(e) => set(k, e.target.checked)} />
                </label>
              )}
            </div>
          ))}
        </div>
      </div>
      <pre className="code">
        <code>{highlight(code(values))}</code>
      </pre>
    </div>
  );
}
