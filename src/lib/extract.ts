import { strFromU8, unzipSync } from 'fflate';

/**
 * Turns a file into plain text with light structure:
 *   "# " heading lines, "- " list items, and "term<TAB>definition" pairs (from tables and CSV).
 * Everything runs in the browser; files are never uploaded.
 */

export const ACCEPTED_EXTENSIONS = ['pdf', 'docx', 'pptx', 'odt', 'txt', 'md', 'markdown', 'csv', 'tsv', 'html', 'htm'];
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',');

export interface Extracted {
  text: string;
  /** e.g. "12 pages, 3,400 words" */
  detail: string;
}

export class ExtractError extends Error {}

export type Progress = (message: string) => void;

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff']);
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const ODF_TEXT = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
const ODF_TABLE = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';

const numberFmt = new Intl.NumberFormat();
const words = (text: string) => (text.match(/\S+/g) ?? []).length;
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

export async function extractText(file: File, onProgress: Progress = () => {}): Promise<Extracted> {
  const ext = extensionOf(file.name);
  let text: string;
  let unit = '';

  if (IMAGE_EXT.has(ext) || file.type.startsWith('image/')) {
    throw new ExtractError(
      "Capi’s Deck can't read text inside images yet. Copy the text out of the photo, or export the notes as a PDF with selectable text.",
    );
  }
  if (ext === 'doc' || ext === 'ppt' || ext === 'xls' || ext === 'xlsx') {
    const modern = ext === 'doc' ? '.docx' : ext === 'ppt' ? '.pptx' : '.csv';
    throw new ExtractError(`This file type can't be read. Save it as ${modern} and drop it in again.`);
  }

  try {
    switch (ext) {
      case 'pdf': {
        const result = await readPdf(file, onProgress);
        text = result.text;
        unit = `${result.pages} ${result.pages === 1 ? 'page' : 'pages'}, `;
        break;
      }
      case 'docx':
        onProgress('Unpacking the document');
        text = readDocx(await bytes(file));
        break;
      case 'pptx': {
        onProgress('Unpacking the slides');
        const result = readPptx(await bytes(file));
        text = result.text;
        unit = `${result.slides} ${result.slides === 1 ? 'slide' : 'slides'}, `;
        break;
      }
      case 'odt':
        onProgress('Unpacking the document');
        text = readOdt(await bytes(file));
        break;
      case 'csv':
      case 'tsv':
        text = readDelimited(await file.text(), ext === 'tsv' ? '\t' : ',');
        break;
      case 'html':
      case 'htm':
        text = readHtml(await file.text());
        break;
      default:
        if (ACCEPTED_EXTENSIONS.includes(ext) || file.type.startsWith('text/') || ext === '') {
          text = await file.text();
        } else {
          throw new ExtractError(
            `".${ext}" files can't be read. Capi’s Deck reads PDF, Word (.docx), PowerPoint (.pptx), OpenDocument (.odt), Markdown, plain text, CSV and HTML.`,
          );
        }
    }
  } catch (error) {
    if (error instanceof ExtractError) throw error;
    const name = (error as { name?: string })?.name;
    if (name === 'PasswordException') throw new ExtractError('This PDF is password-protected. Remove the password and try again.');
    if (name === 'InvalidPDFException') throw new ExtractError("This PDF looks damaged and couldn't be opened.");
    throw new ExtractError(`This file couldn't be read. It may be damaged, or not really a .${ext || 'text'} file.`);
  }

  if (!text.trim()) {
    throw new ExtractError(
      ext === 'pdf'
        ? 'No selectable text in this PDF. It is probably a scan. Run it through OCR (most scanner apps can) and try again.'
        : 'This file has no text in it to turn into cards.',
    );
  }
  return { text, detail: `${unit}${numberFmt.format(words(text))} words` };
}

async function bytes(file: File) {
  return new Uint8Array(await file.arrayBuffer());
}

function unzipEntry(data: Uint8Array, name: string): string {
  const files = unzipSync(data, { filter: (f) => f.name === name });
  if (!files[name]) throw new ExtractError("This file is missing the part that holds its text, so it couldn't be read.");
  return strFromU8(files[name]);
}

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new ExtractError("This file's contents are malformed and couldn't be read.");
  return doc;
}

/* PDF */

async function readPdf(file: File, onProgress: Progress): Promise<{ text: string; pages: number }> {
  onProgress('Opening the PDF');
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: await bytes(file) });
  const doc = await task.promise;
  const pages: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      onProgress(`Reading page ${i} of ${doc.numPages}`);
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let line = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = '';
        }
      }
      if (line) lines.push(line);
      pages.push(lines.join('\n'));
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return { text: pages.join('\n\n'), pages: pages.length };
}

/* Word */

function readDocx(data: Uint8Array): string {
  const doc = parseXml(unzipEntry(data, 'word/document.xml'));
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) return '';
  const out: string[] = [];

  const paragraphText = (p: Element) => {
    let s = '';
    const walker = doc.createTreeWalker(p, NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode() as Element | null; n; n = walker.nextNode() as Element | null) {
      if (n.namespaceURI !== W) continue;
      if (n.localName === 't') s += n.textContent ?? '';
      else if (n.localName === 'tab') s += ' ';
      else if (n.localName === 'br') s += '\n';
    }
    return s;
  };

  for (const node of Array.from(body.children)) {
    if (node.localName === 'p') {
      const text = clean(paragraphText(node));
      if (!text) {
        out.push('');
        continue;
      }
      const style = node.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val') ?? '';
      const heading = /^heading\s?(\d)/i.exec(style) ?? (/^title$/i.test(style) ? ['', '1'] : null);
      if (heading) out.push(`${'#'.repeat(Number(heading[1]) || 1)} ${text}`);
      else if (node.getElementsByTagNameNS(W, 'numPr').length) out.push(`- ${text}`);
      else out.push(text, '');
    } else if (node.localName === 'tbl') {
      for (const row of Array.from(node.getElementsByTagNameNS(W, 'tr'))) {
        const cells = Array.from(row.getElementsByTagNameNS(W, 'tc')).map((tc) =>
          clean(Array.from(tc.getElementsByTagNameNS(W, 'p')).map(paragraphText).join(' ')),
        );
        const filled = cells.filter(Boolean);
        if (filled.length === 2) out.push(`${filled[0]}\t${filled[1]}`);
        else if (filled.length) out.push(filled.join('. '));
      }
      out.push('');
    }
  }
  return out.join('\n');
}

/* PowerPoint */

function readPptx(data: Uint8Array): { text: string; slides: number } {
  const files = unzipSync(data, { filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) });
  const names = Object.keys(files).sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  if (names.length === 0) throw new ExtractError('This presentation has no slides with text.');
  const out: string[] = [];
  for (const name of names) {
    const doc = parseXml(strFromU8(files[name]));
    for (const shape of Array.from(doc.getElementsByTagNameNS(P, 'sp'))) {
      const type = shape.getElementsByTagNameNS(P, 'ph')[0]?.getAttribute('type') ?? '';
      const paras = Array.from(shape.getElementsByTagNameNS(A, 'p'))
        .map((p) => clean(Array.from(p.getElementsByTagNameNS(A, 't')).map((t) => t.textContent).join('')))
        .filter(Boolean);
      if (!paras.length) continue;
      if (type === 'title' || type === 'ctrTitle') out.push(`# ${paras.join(' ')}`);
      else if (type === 'sldNum' || type === 'dt' || type === 'ftr') continue;
      else out.push(...paras.map((p) => `- ${p}`));
    }
    out.push('');
  }
  return { text: out.join('\n'), slides: names.length };
}

/* OpenDocument text */

function readOdt(data: Uint8Array): string {
  const doc = parseXml(unzipEntry(data, 'content.xml'));
  const out: string[] = [];
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode() as Element | null; n; n = walker.nextNode() as Element | null) {
    if (n.namespaceURI === ODF_TABLE && n.localName === 'table-row') {
      const cells = Array.from(n.getElementsByTagNameNS(ODF_TABLE, 'table-cell')).map((c) => clean(c.textContent ?? '')).filter(Boolean);
      if (cells.length === 2) out.push(`${cells[0]}\t${cells[1]}`);
      else if (cells.length) out.push(cells.join('. '));
      continue;
    }
    if (n.namespaceURI !== ODF_TEXT) continue;
    if (insideTableCell(n)) continue;
    const text = clean(n.textContent ?? '');
    if (n.localName === 'h' && text) {
      const level = Number(n.getAttributeNS(ODF_TEXT, 'outline-level')) || 1;
      out.push(`${'#'.repeat(Math.min(level, 6))} ${text}`);
    } else if (n.localName === 'p' && text) {
      out.push(n.parentElement?.localName === 'list-item' ? `- ${text}` : text, '');
    }
  }
  return out.join('\n');
}

function insideTableCell(el: Element): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.namespaceURI === ODF_TABLE && p.localName === 'table-cell') return true;
  }
  return false;
}

/* CSV / TSV */

function parseDelimited(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const HEADER_WORDS = /^(term|terms|word|front|question|prompt|concept|definition|meaning|back|answer|translation|english|name)$/i;

function readDelimited(input: string, delimiter: string): string {
  const rows = parseDelimited(input, delimiter)
    .map((r) => r.map(clean))
    .filter((r) => r.some(Boolean));
  if (rows.length && rows[0].length >= 2 && HEADER_WORDS.test(rows[0][0]) && HEADER_WORDS.test(rows[0][1])) rows.shift();
  return rows.map((r) => (r.filter(Boolean).length >= 2 ? `${r[0]}\t${r[1]}` : r.join(' '))).join('\n');
}

/* HTML */

function readHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, nav, footer, noscript').forEach((el) => el.remove());
  const out: string[] = [];
  doc.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, dt, tr').forEach((el) => {
    if (el.tagName === 'TR') {
      const cells = Array.from(el.children).map((c) => clean(c.textContent ?? '')).filter(Boolean);
      if (cells.length === 2) out.push(`${cells[0]}\t${cells[1]}`);
      return;
    }
    if (el.tagName === 'DT') {
      const dd = el.nextElementSibling;
      if (dd?.tagName === 'DD') out.push(`${clean(el.textContent ?? '')}\t${clean(dd.textContent ?? '')}`);
      return;
    }
    if (el.closest('li') && el.tagName !== 'LI') return;
    const text = clean(el.textContent ?? '');
    if (!text) return;
    if (/^H\d$/.test(el.tagName)) out.push(`${'#'.repeat(Number(el.tagName[1]))} ${text}`);
    else if (el.tagName === 'LI') out.push(`- ${text}`);
    else out.push(text, '');
  });
  return out.join('\n');
}
