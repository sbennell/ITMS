import bwipjs from 'bwip-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { getPrinters, print } from 'pdf-to-printer';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Dymo 1933081 label dimensions: 25mm × 89mm (height × width)
// For landscape orientation: width = 89mm, height = 25mm
const LABEL_WIDTH_PT = 252;   // 89mm (width)
const LABEL_HEIGHT_PT = 71;   // 25mm (height)

export interface LabelAsset {
  itemNumber: string;
  serialNumber?: string | null;
  model?: string | null;
  hostname?: string | null;
  ipAddress?: string | null;
  assignedTo?: string | null;
  manufacturer?: { name: string } | null;
  organizationName?: string | null;
}

export interface LabelSettings {
  printerName: string;
  showAssignedTo: boolean;
  showHostname: boolean;
  showIpAddress: boolean;
  qrCodeContent: 'full' | 'itemNumber';
}

const DEFAULT_SETTINGS: LabelSettings = {
  printerName: '',
  showAssignedTo: true,
  showHostname: true,
  showIpAddress: true,
  qrCodeContent: 'itemNumber',  // Show item number only in QR for compact label
};

/**
 * Generate a QR code as PNG buffer
 */
export async function generateQRCode(text: string, size: number = 150): Promise<Buffer> {
  const png = await bwipjs.toBuffer({
    bcid: 'qrcode',
    text: text,
    scale: 3,
    width: Math.floor(size / 10),
    height: Math.floor(size / 10),
  } as bwipjs.RenderOptions);
  return png;
}

/**
 * Generate a Code128 barcode as PNG buffer
 */
export async function generateBarcode(text: string): Promise<Buffer> {
  const png = await bwipjs.toBuffer({
    bcid: 'code128',
    text: text,
    scale: 2,
    height: 8,
    includetext: false,
  } as bwipjs.RenderOptions);
  return png;
}

/**
 * Build QR code content based on qrCodeContent setting
 */
function buildQRContent(asset: LabelAsset, opts: LabelSettings): string {
  // If qrCodeContent is set to itemNumber, return only the item number
  if (opts.qrCodeContent === 'itemNumber') {
    return asset.itemNumber;
  }

  // Otherwise, build full QR content with all label info
  const lines: string[] = [];

  if (opts.showAssignedTo && asset.assignedTo) {
    lines.push(asset.assignedTo);
  }
  lines.push(`Item: ${asset.itemNumber}`);
  // Model is always included
  if (asset.model) {
    const modelText = asset.manufacturer?.name
      ? `${asset.manufacturer.name} ${asset.model}`
      : asset.model;
    lines.push(modelText);
  }
  // Serial Number is always included (under Model)
  if (asset.serialNumber) {
    lines.push(`S/N: ${asset.serialNumber}`);
  }
  // Hostname and IP on separate lines in QR (even though printed on one line)
  if (opts.showHostname && asset.hostname) {
    lines.push(asset.hostname);
  }
  if (opts.showIpAddress && asset.ipAddress) {
    lines.push(asset.ipAddress);
  }
  if (asset.organizationName) {
    lines.push(asset.organizationName);
  }

  return lines.join('\n');
}

/**
 * Create a label PDF for an asset (Dymo 1933081 - 25mm×89mm)
 * Landscape PDF (89mm x 25mm) with QR on left, text on right
 */
export async function createLabelPDF(
  asset: LabelAsset,
  settings: Partial<LabelSettings> = {}
): Promise<Uint8Array> {
  const opts = { ...DEFAULT_SETTINGS, ...settings };

  // Generate QR code
  const qrContent = buildQRContent(asset, opts);
  const qrBuffer = await generateQRCode(qrContent, 120);

  // Create PDF document - landscape orientation (89mm x 25mm)
  const doc = await PDFDocument.create();
  const page = doc.addPage([LABEL_WIDTH_PT, LABEL_HEIGHT_PT]);

  // Embed bold font for all text
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  // Embed QR code image
  const qrImage = await doc.embedPng(qrBuffer);

  // Layout: Landscape - QR on left, text on right
  const margin = 3;
  const qrSize = 45; // Larger QR code

  // QR code on LEFT, vertically centered
  const qrX = margin;
  const qrY = (LABEL_HEIGHT_PT - qrSize) / 2;

  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });

  // Text starts after QR code
  const textX = qrX + qrSize + 3;
  let textY = LABEL_HEIGHT_PT - 10; // Start near top of label (moved down to avoid cutoff)

  // Text styling - increased sizes
  const fontSize = 11;
  const boldFontSize = 11;
  const assignedToFontSize = 11;
  const lineHeight = 9.5;
  const textAreaWidth = LABEL_WIDTH_PT - textX - margin; // Available width for text

  // Assigned To (if present) - centered across full label width
  if (opts.showAssignedTo && asset.assignedTo) {
    const assignedText = truncateText(asset.assignedTo, 28);
    const assignedWidth = boldFont.widthOfTextAtSize(assignedText, assignedToFontSize);
    const assignedX = (LABEL_WIDTH_PT - assignedWidth) / 2;

    page.drawText(assignedText, {
      x: assignedX,
      y: textY,
      size: assignedToFontSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    textY -= lineHeight;
  }

  // Item Number
  page.drawText(truncateText(`Item: ${asset.itemNumber}`, 25), {
    x: textX,
    y: textY,
    size: boldFontSize,
    font: regularFont,
    color: rgb(0, 0, 0),
  });
  textY -= lineHeight;

  // Model (always shown) - auto-fit to available width
  if (asset.model) {
    const modelText = asset.manufacturer?.name
      ? `${asset.manufacturer.name} ${asset.model}`
      : asset.model;
    const maxModelFontSize = 11;
    const minModelFontSize = 4;

    // Calculate font size to fit text within available width
    let modelFontSize = maxModelFontSize;
    let modelWidth = boldFont.widthOfTextAtSize(modelText, modelFontSize);

    // Scale down if text is too wide
    if (modelWidth > textAreaWidth) {
      modelFontSize = Math.max(minModelFontSize, (textAreaWidth / modelWidth) * maxModelFontSize);
    }

    page.drawText(modelText, {
      x: textX,
      y: textY,
      size: modelFontSize,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
    textY -= lineHeight;
  }

  // Serial Number (always shown, under Model)
  if (asset.serialNumber) {
    page.drawText(truncateText(`S/N: ${asset.serialNumber}`, 25), {
      x: textX,
      y: textY,
      size: fontSize,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
    textY -= lineHeight;
  }

  // Hostname on its own line
  if (opts.showHostname && asset.hostname) {
    page.drawText(truncateText(asset.hostname, 30), {
      x: textX,
      y: textY,
      size: fontSize,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
    textY -= lineHeight;
  }

  // IP Address on its own line
  if (opts.showIpAddress && asset.ipAddress) {
    page.drawText(truncateText(asset.ipAddress, 30), {
      x: textX,
      y: textY,
      size: fontSize,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
    textY -= lineHeight;
  }

  // Organization Name - centered across full label width at bottom
  if (asset.organizationName && textY > 3) {
    const orgText = truncateText(asset.organizationName, 40);
    const maxFontSize = 11;
    let orgFontSize = maxFontSize;
    let orgWidth = boldFont.widthOfTextAtSize(orgText, orgFontSize);

    // Scale down if too wide for full label width
    const fullLabelWidth = LABEL_WIDTH_PT - (margin * 2);
    if (orgWidth > fullLabelWidth) {
      orgFontSize = Math.max(5, (fullLabelWidth / orgWidth) * maxFontSize);
      orgWidth = boldFont.widthOfTextAtSize(orgText, orgFontSize);
    }

    const orgX = (LABEL_WIDTH_PT - orgWidth) / 2;
    page.drawText(orgText, {
      x: orgX,
      y: 4,
      size: orgFontSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
  }

  return doc.save();
}

/**
 * Create a label preview as PNG image
 */
export async function createLabelPreview(
  asset: LabelAsset,
  settings: Partial<LabelSettings> = {}
): Promise<Buffer> {
  const qrBuffer = await generateQRCode(asset.itemNumber, 200);
  return qrBuffer;
}

/**
 * Print a label to the specified printer using pdf-to-printer
 */
export async function printLabel(
  pdfBytes: Uint8Array,
  printerName: string
): Promise<void> {
  // Write PDF to temp file
  const tempPath = join(tmpdir(), `label-dymo-${Date.now()}.pdf`);
  writeFileSync(tempPath, Buffer.from(pdfBytes));

  try {
    // Use pdf-to-printer with Dymo paper size (25mm x 89mm)
    const printOptions: any = {
      paperSize: '25x89mm',
      orientation: 'landscape',
      scale: 'fit',
    };

    if (printerName) {
      printOptions.printer = printerName;
    }

    await print(tempPath, printOptions);
  } finally {
    // Clean up temp file after a delay
    setTimeout(() => {
      try {
        unlinkSync(tempPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }, 2000);
  }
}

/**
 * Get list of available printers
 */
export async function getAvailablePrinters(): Promise<string[]> {
  try {
    const printers = await getPrinters();
    return printers.map(p => p.name);
  } catch (error) {
    console.error('Failed to get printers:', error);
    return [];
  }
}

/**
 * Truncate text to fit within label width
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 2) + '..';
}
