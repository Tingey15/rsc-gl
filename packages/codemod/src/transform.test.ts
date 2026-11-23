import { describe, expect, it } from 'vitest';
import { removeJsxProp, transform } from './transform';

const LEGACY = 'legacy-charts';

describe('codemod', () => {
  it('rewrites imports including pre-release sub-paths', () => {
    const src = `import { Chart, Bar } from '${LEGACY}';\nimport { Donut } from "${LEGACY}/rc";\nconst x = require('${LEGACY}');`;
    const r = transform(src, { from: [LEGACY] });
    expect(r.changed).toBe(true);
    expect(r.code).toContain(`from '@rsc-gl/react'`);
    expect(r.code).toContain(`from "@rsc-gl/react"`);
    expect(r.code).toContain(`require('@rsc-gl/react')`);
  });

  it('removes renderer-specific props with nested values', () => {
    const src = `import { Chart } from '${LEGACY}';\n<Chart data={d} renderer="svg" config={{ axis: { labelColor: '}' } }} debug height={300}>\n  <Bar />\n</Chart>`;
    const r = transform(src, { from: [LEGACY] });
    expect(r.code).not.toContain('renderer=');
    expect(r.code).not.toContain('config=');
    expect(r.code).not.toMatch(/\sdebug\s/);
    expect(r.code).toContain('height={300}');
    expect(r.code).toContain('data={d}');
  });

  it('leaves files that do not use the legacy package alone', () => {
    const src = `import { Chart } from 'other';\n<Chart renderer="svg" />`;
    expect(transform(src, { from: [LEGACY] }).changed).toBe(false);
  });

  it('only touches props inside JSX tags', () => {
    expect(removeJsxProp(`const renderer = 1; <A renderer="x" />`, 'renderer').code).toBe(`const renderer = 1; <A />`);
  });

  it('adds review notes for props that changed meaning', () => {
    const r = transform(`import { Chart } from '${LEGACY}';\n<Chart theme={darkTheme} />`, { from: [LEGACY] });
    expect(r.code.startsWith('// TODO(rsc-gl)')).toBe(true);
  });
});
