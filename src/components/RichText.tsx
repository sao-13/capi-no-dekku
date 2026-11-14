import { memo, useMemo, type ReactNode } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { parseMarkup, type MNode } from '../lib/markup';
import './RichText.css';

const Math = memo(function Math({ tex, display }: { tex: string; display: boolean }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore' }), [tex, display]);
  return <span className={display ? 'rt-math-display' : 'rt-math'} dangerouslySetInnerHTML={{ __html: html }} />;
});

function render(nodes: MNode[], keyPrefix = ''): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`;
    switch (n.t) {
      case 'text':
        return n.v;
      case 'b':
        return <strong key={key}>{render(n.c, key)}</strong>;
      case 'i':
        return <em key={key}>{render(n.c, key)}</em>;
      case 'u':
        return <u key={key}>{render(n.c, key)}</u>;
      case 'mark':
        return (
          <mark key={key} className="rt-mark">
            {render(n.c, key)}
          </mark>
        );
      case 'math':
        return <Math key={key} tex={n.v} display={n.display} />;
      case 'cloze':
        return (
          <span key={key} className="rt-cloze">
            {render(n.c, key)}
          </span>
        );
      case 'blank':
        return (
          <span key={key} className="rt-blank">
            [{n.hint || '…'}]
          </span>
        );
      case 'reveal':
        return (
          <span key={key} className="rt-reveal">
            {render(n.c, key)}
          </span>
        );
    }
  });
}

interface Props {
  text: string;
  className?: string;
  as?: 'p' | 'span' | 'div';
}

/** Renders a card field's markup: formatting, KaTeX math and cloze blanks. */
export function RichText({ text, className, as: Tag = 'span' }: Props) {
  const nodes = useMemo(() => render(parseMarkup(text)), [text]);
  return <Tag className={`rt${className ? ` ${className}` : ''}`}>{nodes}</Tag>;
}
