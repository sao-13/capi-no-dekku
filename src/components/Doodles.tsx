import type { ReactNode } from 'react';
import './Doodles.css';

/** Draws pixel art from rows of characters; each character maps to a colour ('.' is empty). */
export function PixelSprite({ rows, palette, size, className, title }: { rows: string[]; palette: Record<string, string>; size: number; className?: string; title?: string }) {
  const w = rows[0].length;
  const h = rows.length;
  const rects: ReactNode[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      if (ch !== '.' && palette[ch]) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={palette[ch]} />);
      x += run;
    }
  });
  return (
    <svg
      className={className}
      width={size}
      height={(size * h) / w}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rects}
    </svg>
  );
}

const TOMATO = [
  '........kk........',
  '.......kgk........',
  '....kk.kgk.kk.....',
  '...kggkkggkgGk....',
  '..kkkgGGgGGggkk...',
  '.kRRkkgGkgkkRRRk..',
  'kRRrrRkkRkRRRRRRk.',
  'kRwwrRRRRRRRRRRRRk',
  'kRwrRRRRRRRRRRRRRk',
  'kRwRRRRRRRRRRRRRRk',
  'kRRRRRRRRRRRRRRRdk',
  'kRRRRRRRRRRRRRRRdk',
  'kRRRRRRRRRRRRRRddk',
  '.kRRRRRRRRRRRRRddk',
  '.kdRRRRRRRRRRRdddk',
  '..kddRRRRRRRRdddk.',
  '...kkddddddddkk...',
  '.....kkkkkkkk.....',
];

const TOMATO_COLORS = { k: '#3a1f1a', R: '#d8463a', r: '#f07d6c', w: '#fde3d8', d: '#a8302a', g: '#4c8a3c', G: '#6fb04f' };

const HOURGLASS = [
  'kkkkkkkkk',
  'kbbbbbbbk',
  '.kgsssgk.',
  '.kgsssgk.',
  '..kgssk..',
  '...ksk...',
  '...kgk...',
  '..kgsgk..',
  '.kgsssgk.',
  '.kssssgk.',
  'kbbbbbbbk',
  'kkkkkkkkk',
];

const HOURGLASS_COLORS = { k: '#4a3524', b: '#c79a52', g: '#f3ecd8', s: '#e2b65a' };

export function Tomato({ size = 120 }: { size?: number }) {
  return <PixelSprite rows={TOMATO} palette={TOMATO_COLORS} size={size} className="sprite" />;
}

export function Hourglass({ size = 34 }: { size?: number }) {
  return <PixelSprite rows={HOURGLASS} palette={HOURGLASS_COLORS} size={size} className="sprite" />;
}

/** A hand-lettered speech bubble in the pixel font. */
export function SpeechBubble({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={`bubble${className ? ` ${className}` : ''}`}>{children}</p>;
}
