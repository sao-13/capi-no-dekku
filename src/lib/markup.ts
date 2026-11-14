/**
 * The small markup language card fields use. Kept as plain text so it survives copy/paste,
 * storage and editing in an ordinary textarea.
 *
 *   **bold**   *italic*   __underline__   ==highlight==
 *   $inline math$   $$display math$$   (LaTeX, rendered with KaTeX; \$ is a literal dollar)
 *   {{c1::hidden text}}   {{c1::hidden text::hint}}   (cloze deletions)
 */

export type MNode =
  | { t: 'text'; v: string }
  | { t: 'b' | 'i' | 'u' | 'mark'; c: MNode[] }
  | { t: 'math'; v: string; display: boolean }
  | { t: 'cloze'; n: number; c: MNode[] }
  /** A hidden cloze on the question side; shows the hint or an ellipsis. */
  | { t: 'blank'; hint: string }
  /** The asked cloze on the answer side. */
  | { t: 'reveal'; c: MNode[] };

const RULES: [RegExp, (m: RegExpExecArray) => MNode][] = [
  [/^\$\$([\s\S]+?)\$\$/, (m) => ({ t: 'math', v: m[1].trim(), display: true })],
  [/^\$([^$\n]+?)\$/, (m) => ({ t: 'math', v: m[1], display: false })],
  [/^\{\{\?::([^}]*)\}\}/, (m) => ({ t: 'blank', hint: m[1] })],
  [/^\{\{!::([\s\S]+?)\}\}/, (m) => ({ t: 'reveal', c: parseMarkup(m[1]) })],
  [/^\{\{c(\d+)::([\s\S]+?)(?:::([^}]*))?\}\}/, (m) => ({ t: 'cloze', n: Number(m[1]), c: parseMarkup(m[2]) })],
  [/^\*\*([\s\S]+?)\*\*/, (m) => ({ t: 'b', c: parseMarkup(m[1]) })],
  [/^__([\s\S]+?)__/, (m) => ({ t: 'u', c: parseMarkup(m[1]) })],
  [/^==([\s\S]+?)==/, (m) => ({ t: 'mark', c: parseMarkup(m[1]) })],
  [/^\*([^*\n]+?)\*/, (m) => ({ t: 'i', c: parseMarkup(m[1]) })],
];

const TRIGGERS = new Set(['$', '{', '*', '_', '=']);

export function parseMarkup(src: string): MNode[] {
  const out: MNode[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  outer: while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && src[i + 1] === '$') {
      buf += '$';
      i += 2;
      continue;
    }
    if (TRIGGERS.has(ch)) {
      const rest = src.slice(i);
      for (const [re, make] of RULES) {
        const m = re.exec(rest);
        if (m) {
          flush();
          out.push(make(m));
          i += m[0].length;
          continue outer;
        }
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** Text with all markup removed, for comparisons and screen-reader labels. */
export function plainText(src: string): string {
  const walk = (nodes: MNode[]): string =>
    nodes
      .map((n) => {
        switch (n.t) {
          case 'text':
            return n.v;
          case 'math':
            return n.v;
          case 'blank':
            return n.hint || '…';
          default:
            return walk(n.c);
        }
      })
      .join('');
  return walk(parseMarkup(src));
}

export const hasMarkup = (src: string) => /\*|__|==|\$|\{\{c\d/.test(src);

/* Cloze helpers */

const CLOZE = /\{\{c(\d+)::([\s\S]+?)(?:::([^}]*))?\}\}/g;

export function clozeNumbers(text: string): number[] {
  return [...new Set([...text.matchAll(CLOZE)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

export const nextClozeNumber = (text: string) => Math.max(0, ...clozeNumbers(text)) + 1;

/** Question side: cloze n becomes a blank, the others show their text. */
export function clozeQuestion(text: string, n: number): string {
  return text.replace(CLOZE, (_, num, inner, hint) => (Number(num) === n ? `{{?::${hint ?? ''}}}` : inner));
}

/** Answer side: cloze n is revealed and marked, the others show their text. */
export function clozeRevealed(text: string, n: number): string {
  return text.replace(CLOZE, (_, num, inner) => (Number(num) === n ? `{{!::${inner}}}` : inner));
}

/** Just the hidden text for cloze n, e.g. for a quiz answer. */
export function clozeAnswer(text: string, n: number): string {
  return [...text.matchAll(CLOZE)]
    .filter((m) => Number(m[1]) === n)
    .map((m) => m[2])
    .join(', ');
}

/** Every cloze shown, for list views. */
export const clozeAllRevealed = (text: string) => text.replace(CLOZE, (_, __, inner) => `{{!::${inner}}}`);
