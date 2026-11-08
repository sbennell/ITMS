import { readFileSync } from 'fs';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib';

const FONT_DIR = path.join(__dirname, '../../assets/fonts');

const FONTS = {
  regular: { standard: StandardFonts.Helvetica, fallback: 'NotoSans-Regular.ttf' },
  bold: { standard: StandardFonts.HelveticaBold, fallback: 'NotoSans-Bold.ttf' }
};

export type TextFont = (text: string) => { text: string; font: PDFFont };

// Helvetica keeps existing label and card layouts unchanged, but pdf-lib throws on
// anything outside Western European text. Such text uses Noto Sans instead, with
// characters it has no glyph for (e.g. Arabic, Chinese) replaced by "?".
//
// `texts` is everything the document may draw: Noto Sans is only embedded when one of
// them needs it. It is embedded whole because pdf-lib's subsetting produced text that
// could be extracted but did not render.
export async function embedTextFont(
  doc: PDFDocument,
  weight: keyof typeof FONTS,
  texts: (string | null | undefined)[]
): Promise<TextFont> {
  const standard = await doc.embedFont(FONTS[weight].standard);
  const standardChars = new Set(standard.getCharacterSet());
  const isStandard = (text: string) => Array.from(text).every((c) => standardChars.has(c.codePointAt(0)!));

  let fallback = standard;
  if (texts.some((text) => text && !isStandard(text.normalize('NFC')))) {
    doc.registerFontkit(fontkit);
    fallback = await doc.embedFont(readFileSync(path.join(FONT_DIR, FONTS[weight].fallback)));
  }
  const fallbackChars = new Set(fallback.getCharacterSet());

  return (raw) => {
    const text = raw.normalize('NFC');
    if (isStandard(text)) {
      return { text, font: standard };
    }
    return {
      text: Array.from(text).map((c) => (fallbackChars.has(c.codePointAt(0)!) ? c : '?')).join(''),
      font: fallback
    };
  };
}
