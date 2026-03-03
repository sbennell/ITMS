import { PDFDocument, rgb, StandardFonts, LineCapStyle } from 'pdf-lib';

export interface LoginCardStudent {
  firstName: string;
  surname: string;
  homeGroup: string | null;
  schoolYear: string | null;
  username: string | null;
  email: string | null;
  password: string | null;
}

/**
 * Generate student login cards as a PDF document
 * Layout: A4 portrait, 2 columns × 8 rows = 16 cards per page
 * Content fills card height evenly with no whitespace gaps
 */
export async function generateStudentLoginCards(students: LoginCardStudent[]): Promise<Uint8Array> {
  // Sort students by year level, home group, then first name
  const sortedStudents = [...students].sort((a, b) => {
    // Sort by school year (year level)
    if ((a.schoolYear || '') !== (b.schoolYear || '')) {
      return (a.schoolYear || '').localeCompare(b.schoolYear || '');
    }
    // Then by home group
    if ((a.homeGroup || '') !== (b.homeGroup || '')) {
      return (a.homeGroup || '').localeCompare(b.homeGroup || '');
    }
    // Then by first name
    return a.firstName.localeCompare(b.firstName);
  });

  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  // Page dimensions (A4 portrait)
  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 15;
  const COL_GUTTER = 8;
  const ROW_GUTTER = 4;
  const COLS = 2;
  const ROWS = 8;

  // Calculate card dimensions - fills page evenly
  const CARD_W = (PAGE_W - MARGIN * 2 - COL_GUTTER * (COLS - 1)) / COLS; // ~278pt
  const CARD_H = (PAGE_H - MARGIN * 2 - ROW_GUTTER * (ROWS - 1)) / ROWS; // ~98pt
  const CARDS_PER_PAGE = COLS * ROWS; // 16

  // Card internal padding and fonts
  const PAD = 8;
  const LINE_HEIGHT = 20;
  const FONT_SIZE_MAIN = 11;
  const FONT_SIZE_FOOTER = 10;

  // Chunk sorted students into pages
  for (let pageIdx = 0; pageIdx < Math.ceil(sortedStudents.length / CARDS_PER_PAGE); pageIdx++) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const pageStudents = sortedStudents.slice(
      pageIdx * CARDS_PER_PAGE,
      (pageIdx + 1) * CARDS_PER_PAGE
    );

    pageStudents.forEach((student, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = MARGIN + col * (CARD_W + COL_GUTTER);
      // pdf-lib origin is bottom-left, so Y increases from bottom
      const y = PAGE_H - MARGIN - (row + 1) * CARD_H - row * ROW_GUTTER;

      // Draw dashed card border
      page.drawRectangle({
        x,
        y,
        width: CARD_W,
        height: CARD_H,
        borderWidth: 0.5,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderDashArray: [3, 3],
        borderLineCap: LineCapStyle.Round,
      });

      // Draw card content - sequential layout, vertically centered
      // Content: 3 lines (60pt) + gap (4pt) + separator (0.3pt) + footer (10pt) ≈ 74pt
      // Vertical centering: (CARD_H - content_height) / 2 as top offset
      const contentHeight = LINE_HEIGHT * 3 + 4 + 10;
      const topOffset = (CARD_H - contentHeight) / 2;
      let textY = y + CARD_H - PAD - topOffset;

      // Helper to draw credential line: "Label: value" (centered)
      const drawLine = (label: string, value: string | null) => {
        const displayValue = value || '-';
        const labelWidth = bold.widthOfTextAtSize(label + ' ', FONT_SIZE_MAIN);
        const valueWidth = regular.widthOfTextAtSize(displayValue, FONT_SIZE_MAIN);
        const totalWidth = labelWidth + valueWidth;
        const lineX = x + (CARD_W - totalWidth) / 2;

        page.drawText(label, {
          x: lineX,
          y: textY,
          size: FONT_SIZE_MAIN,
          font: bold,
          color: rgb(0, 0, 0),
        });

        page.drawText(displayValue, {
          x: lineX + labelWidth,
          y: textY,
          size: FONT_SIZE_MAIN,
          font: regular,
          color: rgb(0, 0, 0),
        });

        textY -= LINE_HEIGHT;
      };

      // Draw credential fields
      drawLine('Username:', student.username);
      drawLine('Password:', student.password);
      drawLine('Email:', student.email);

      // Gap and separator line
      page.drawLine({
        start: { x: x + PAD, y: textY },
        end: { x: x + CARD_W - PAD, y: textY },
        thickness: 0.3,
        color: rgb(0.8, 0.8, 0.8),
      });

      // Footer positioned below separator with breathing room
      textY -= 10; // Larger gap after separator for footer spacing
      const footerText = [
        `${student.firstName} ${student.surname}`,
        student.schoolYear,
        student.homeGroup,
      ]
        .filter(Boolean)
        .join(' - ');

      const footerWidth = regular.widthOfTextAtSize(footerText, FONT_SIZE_FOOTER);
      const footerX = x + (CARD_W - footerWidth) / 2;

      page.drawText(footerText, {
        x: footerX,
        y: textY,
        size: FONT_SIZE_FOOTER,
        font: regular,
        color: rgb(0.5, 0.5, 0.5),
      });
    });
  }

  return doc.save();
}
