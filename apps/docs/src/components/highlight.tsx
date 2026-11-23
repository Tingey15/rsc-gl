import { Fragment, type ReactNode } from 'react';

/** Small dependency-free TSX highlighter for docs snippets. */
const RULES: [RegExp, string][] = [
  [/^\/\/[^\n]*/, 'c'],
  [/^\/\*[\s\S]*?\*\//, 'c'],
  [/^(['"`])(?:\\.|(?!\1)[^\\])*\1/, 's'],
  [/^<\/?[A-Z][A-Za-z0-9.]*/, 't'],
  [/^<\/?[a-z][a-z0-9-]*/, 'p'],
  [/^\b(import|from|export|default|const|let|var|function|return|if|else|for|of|in|new|type|interface|extends|as|async|await|true|false|null|undefined)\b/, 'k'],
  [/^\b\d+(\.\d+)?\b/, 'n'],
  [/^[A-Za-z_$][\w$]*(?==)/, 'a'],
];

export function highlight(code: string): ReactNode {
  const out: ReactNode[] = [];
  let i = 0;
  let plain = '';
  let key = 0;
  const flush = () => {
    if (plain) {
      out.push(<Fragment key={key++}>{plain}</Fragment>);
      plain = '';
    }
  };
  while (i < code.length) {
    const rest = code.slice(i);
    let matched = false;
    for (const [re, cls] of RULES) {
      const m = re.exec(rest);
      if (m && m[0].length > 0) {
        // Keywords / numbers must start on a word boundary relative to the previous char.
        if ((cls === 'k' || cls === 'n' || cls === 'a') && i > 0 && /[\w$]/.test(code[i - 1])) continue;
        flush();
        out.push(
          <span key={key++} className={`tok-${cls}`}>
            {m[0]}
          </span>,
        );
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      plain += code[i];
      i++;
    }
  }
  flush();
  return out;
}

export function CodeBlock({ code }: { code: string }) {
  return (
    <div className="code-block">
      <pre className="code">
        <code>{highlight(code.trim())}</code>
      </pre>
    </div>
  );
}
