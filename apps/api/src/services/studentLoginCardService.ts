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
 * Layout: A4 portrait, 2 columns × 4 rows = 8 cards per page
 */
export async function generateStudentLoginCards(students: LoginCardStudent[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  // Page dimensions (A4 portrait)
  const PAGE_W = 595;
  const PAGE_H = 842;
  const MARGIN = 30;
  const GUTTER = 12;
  const COLS = 2;
  const ROWS = 4;

  // Calculate card dimensions
  const CARD_W = (PAGE_W - MARGIN * 2 - GUTTER * (COLS - 1)) / COLS; // ~262pt
  const CARD_H = (PAGE_H - MARGIN * 2 - GUTTER * (ROWS - 1)) / ROWS; // ~185pt
  const CARDS_PER_PAGE = COLS * ROWS; // 8

  // Card internal padding
  const PAD = 12;
  const LINE_HEIGHT = 14;
  const FONT_SIZE_MAIN = 9;
  const FONT_SIZE_FOOTER = 8;

  // Chunk students into pages
  for (let pageIdx = 0; pageIdx < Math.ceil(students.length / CARDS_PER_PAGE); pageIdx++) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const pageStudents = students.slice(
      pageIdx * CARDS_PER_PAGE,
      (pageIdx + 1) * CARDS_PER_PAGE
    );

    pageStudents.forEach((student, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = MARGIN + col * (CARD_W + GUTTER);
      // pdf-lib origin is bottom-left, so Y increases from bottom
      const y = PAGE_H - MARGIN - (row + 1) * CARD_H - row * GUTTER;

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

      // Draw card content
      let textY = y + CARD_H - PAD - 10;

      // Helper to draw a credential line: "Label: value"
      const drawLine = (label: string, value: string | null) => {
        const displayValue = value || '-';
        const labelWidth = bold.widthOfTextAtSize(label + ' ', FONT_SIZE_MAIN);

        page.drawText(label, {
          x: x + PAD,
          y: textY,
          size: FONT_SIZE_MAIN,
          font: bold,
          color: rgb(0, 0, 0),
        });

        page.drawText(displayValue, {
          x: x + PAD + labelWidth,
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

      // Draw separator line
      textY -= 4;
      page.drawLine({
        start: { x: x + PAD, y: textY },
        end: { x: x + CARD_W - PAD, y: textY },
        thickness: 0.4,
        color: rgb(0.8, 0.8, 0.8),
      });

      // Draw footer: "Name - Year - HomeGroup" (gray, centered)
      const footerParts = [
        `${student.firstName} ${student.surname}`,
        student.schoolYear,
        student.homeGroup,
      ]
        .filter(Boolean)
        .join(' - ');

      const footerWidth = regular.widthOfTextAtSize(footerParts, FONT_SIZE_FOOTER);
      const footerX = x + (CARD_W - footerWidth) / 2;

      page.drawText(footerParts, {
        x: footerX,
        y: y + PAD,
        size: FONT_SIZE_FOOTER,
        font: regular,
        color: rgb(0.5, 0.5, 0.5),
      });
    });
  }

  return doc.save();
}
