/**
 * Embeds the Tamil font into a generated JS file so the PDF builder stays
 * synchronous and works fully offline.
 *
 * Source: src/assets/fonts/HindMadurai-Regular.ttf
 *         (Hind Madurai, SIL Open Font License 1.1 — see OFL.txt)
 * It is used because it contains BOTH Tamil and Latin glyphs, so one font can
 * render a mixed "KALAI DIGITAL · கலை டிஜிட்டல்" line inside a PDF cell.
 */
import fs from 'fs';

const SRC = 'src/assets/fonts/HindMadurai-Regular.ttf';
const OUT = 'src/services/tamilFontData.ts';

const base64 = fs.readFileSync(SRC).toString('base64');
const header = `// GENERATED FILE — do not edit by hand.
//
// Hindi/Tamil PDF font for jsPDF, embedded as base64 so PDF export needs no
// network and no extra asset lookup.
//
// Family: Hind Madurai (Tamil + Latin), SIL Open Font License 1.1.
// Source: src/assets/fonts/HindMadurai-Regular.ttf
// Regenerate with: node scripts/embed-tamil-font.mjs
export const TAMIL_TTF_BASE64 =
  '`;

fs.writeFileSync(OUT, `${header}${base64}';\n`);
console.log(`wrote ${OUT} (${Math.round(base64.length / 1024)} KB base64)`);
