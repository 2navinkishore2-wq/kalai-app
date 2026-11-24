/**
 * Tamil text support for the PDF generator.
 *
 * jsPDF has no Unicode shaper and its built-in Helvetica has no Tamil glyphs,
 * which is why Tamil came out as garbage. Two things are needed:
 *
 * 1. An embedded font that actually contains Tamil glyphs. Hind Madurai
 *    (SIL OFL 1.1) is used because it covers Tamil AND Latin, so one font can
 *    draw a mixed line such as `KALAI DIGITAL · கலை டிஜிட்டல்`.
 * 2. Tamil pre-base vowel signs (ெ ே ை, and the pre-base halves of ொ ோ ௌ)
 *    must be moved in front of their consonant to match how Tamil is drawn.
 *    Tamil needs nothing else: the pulli (virama) and all post-base signs sit
 *    correctly with plain glyph advances, which is verified by the PDF tests'
 *    sample output.
 *
 * Text stays real, selectable PDF text — the invoice is never flattened into
 * an image.
 */
import type { jsPDF } from 'jspdf';
import { TAMIL_TTF_BASE64 } from './tamilFontData';

export const PDF_TAMIL_FONT = 'kalaiTamil';
const TAMIL_TTF_FILE = 'HindMadurai-Regular.ttf';
const TAMIL_RANGE = /[\u0B80-\u0BFF]/;

const PRE_SIGNS = new Set(['\u0BC6', '\u0BC7', '\u0BC8']);
const VIRAMA = '\u0BCD';
const CONSONANT = /[\u0B95-\u0BB9]/;
const TWO_PART: Record<string, string> = {
  '\u0BCA': '\u0BC6\u0BBE', // ொ = ெ + ா
  '\u0BCB': '\u0BC7\u0BBE', // ோ = ே + ா
  '\u0BCC': '\u0BC6\u0BD7' // ௌ = ெ + ௗ
};

/** True when the text contains any Tamil codepoint. */
export function hasTamil(value: unknown): boolean {
  return TAMIL_RANGE.test(String(value ?? ''));
}

/**
 * Tamil visual order: a pre-base vowel sign is drawn before its consonant
 * cluster, so `மொத்தம்` must be stored as `ம` + `ெ` + `ா` + `த்தம்` for a
 * non-shaping renderer. Consonant clusters (`க்`, `ஸ்ரீ`) keep their order.
 */
export function tamilVisual(input: string): string {
  const text = String(input ?? '');
  if (!hasTamil(text)) return text;
  const expanded = text.replace(/[\u0BCA-\u0BCC]/g, (m) => TWO_PART[m] || m);
  const out: string[] = [];
  for (const char of expanded) {
    if (PRE_SIGNS.has(char) && out.length > 0 && CONSONANT.test(out[out.length - 1])) {
      let start = out.length - 1;
      // Step over a C + virama + C cluster so the sign lands before the whole
      // cluster, not between its two consonants.
      while (start >= 2 && out[start - 1] === VIRAMA && CONSONANT.test(out[start - 2])) start -= 2;
      out.splice(start, 0, char);
      continue;
    }
    out.push(char);
  }
  return out.join('');
}

const registered = new WeakSet<jsPDF>();

/**
 * Adds the Tamil font to a jsPDF document once. Returns false only if the
 * font could not be registered, so callers can fall back gracefully.
 */
export function ensureTamilFont(doc: jsPDF): boolean {
  if (registered.has(doc)) return true;
  try {
    doc.addFileToVFS(TAMIL_TTF_FILE, TAMIL_TTF_BASE64);
    doc.addFont(TAMIL_TTF_FILE, PDF_TAMIL_FONT, 'normal');
    registered.add(doc);
    return true;
  } catch {
    return false;
  }
}

/** Switches to the Tamil font for this string, if it needs it. */
function useTamilFont(doc: jsPDF, text: string): boolean {
  if (!hasTamil(text)) return false;
  if (!ensureTamilFont(doc)) return false;
  doc.setFont(PDF_TAMIL_FONT, 'normal');
  return true;
}

/** Draws one line, switching fonts automatically for Tamil. */
export function pdfText(
  doc: jsPDF,
  text: unknown,
  x: number,
  y: number,
  options?: { align?: 'left' | 'center' | 'right'; maxWidth?: number }
): void {
  const value = String(text ?? '');
  if (!value) return;
  if (!useTamilFont(doc, value)) {
    doc.text(value, x, y, options);
    return;
  }
  const previous = doc.getFont();
  doc.text(tamilVisual(value), x, y, options);
  doc.setFont(previous.fontName, previous.fontStyle);
}

/** Width-aware wrapping that understands Tamil strings. */
export function pdfSplitTextToSize(doc: jsPDF, text: unknown, width: number): string[] {
  const value = String(text ?? '');
  if (!value) return [];
  if (!useTamilFont(doc, value)) return doc.splitTextToSize(value, width) as string[];
  const previous = doc.getFont();
  const lines = doc.splitTextToSize(tamilVisual(value), width) as string[];
  doc.setFont(previous.fontName, previous.fontStyle);
  return lines;
}

/**
 * autoTable hook body: renders Tamil cells with the embedded font in visual
 * order, and leaves every other cell on Helvetica.
 */
export function tableCellForTamil(doc: jsPDF, raw: unknown, apply: (font: string, lines: string[]) => void): void {
  const text = Array.isArray(raw) ? raw.join('\n') : String(raw ?? '');
  if (!hasTamil(text) || !ensureTamilFont(doc)) return;
  apply(PDF_TAMIL_FONT, text.split('\n').map(tamilVisual));
}
