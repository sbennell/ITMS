import bwipjs from 'bwip-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { getPrinters, print } from 'pdf-to-printer';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export type LabelSize = 'brother-29x62' | 'dymo-25x89';

interface LabelDimensions {
  widthPt: number;   // along tape (print length)
  heightPt: number;  // tape width
  paperSize: string; // pdf-to-printer paperSize string
  qrSize: number;    // QR code size in points
}

const LABEL_DIMENSIONS: Record<LabelSize, LabelDimensions> = {
  'brother-29x62': { widthPt: 176, heightPt: 82, paperSize: '29x62mm', qrSize: 48 },
  'dymo-25x89':    { widthPt: 252, heightPt: 71, paperSize: '89x25mm', qrSize: 40 },
};

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
  labelSize: LabelSize;
  showAssignedTo: boolean;
  showHostname: boolean;
  showIpAddress: boolean;
  qrCodeContent: 'full' | 'itemNumber';
  // Note: Item Number, Model, and Serial Number are always shown
}

const DEFAULT_SETTINGS: LabelSettings = {
  printerName: '',
  labelSize: 'brother-29x62',
  showAssignedTo: true,
  showHostname: true,
  showIpAddress: true,
  qrCodeContent: 'full',
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
  // Hostname and IP on separate lines
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
 * Create a label PDF for an asset
 * Landscape PDF (62mm x 29mm) with QR on left, text on right
 * Brother QL driver handles rotation for 29mm tape
 */
export async function createLabelPDF(
  asset: LabelAsset,
  settings: Partial<LabelSettings> = {}
): Promise<Uint8Array> {
  const opts = { ...DEFAULT_SETTINGS, ...settings };
  const dims = LABEL_DIMENSIONS[opts.labelSize];

  // Generate QR code containing all label information
  const qrContent = buildQRContent(asset, opts);
  const qrBuffer = await generateQRCode(qrContent, 150);

  // Create PDF document - landscape orientation
  const doc = await PDFDocument.create();
  const page = doc.addPage([dims.widthPt, dims.heightPt]);

  // Embed bold font for all text
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  // Embed QR code image
  const qrImage = await doc.embedPng(qrBuffer);

  // Layout: Landscape - QR on left, text on right
  const margin = 3;
  const qrSize = dims.qrSize;

  // QR code on LEFT, vertically centered on full label height
  const qrX = margin;
  const qrY = (dims.heightPt - qrSize) / 2;

  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });

  // Assigned To name - centered at top of label, auto-fit to fill width
  const topMargin = 12; // Space from top for assigned to name
  if (opts.showAssignedTo && asset.assignedTo) {
    const assignedText = asset.assignedTo;
    const availableWidth = dims.widthPt - (margin * 2);
    const maxAssignedFontSize = 14;
    const minAssignedFontSize = 7;

    // Calculate font size to fit text within available width
    let assignedFontSize = maxAssignedFontSize;
    let assignedWidth = boldFont.widthOfTextAtSize(assignedText, assignedFontSize);

    // Scale down if text is too wide
    if (assignedWidth > availableWidth) {
      assignedFontSize = Math.max(minAssignedFontSize, (availableWidth / assignedWidth) * maxAssignedFontSize);
      assignedWidth = boldFont.widthOfTextAtSize(assignedText, assignedFontSize);
    }

    page.drawText(assignedText, {
      x: (dims.widthPt - assignedWidth) / 2,
      y: dims.heightPt - topMargin,
      size: assignedFontSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
  }

  // Text starts after QR code
  const textX = qrX + qrSize + 2;
  let textY = dims.heightPt - 20; // Start below the assigned to name

  // Text styling
  const fontSize = 8;
  const boldFontSize = 9;
  const lineHeight = 10;
  const textAreaWidth = dims.widthPt - textX - margin; // Available width for text

  // Item Number with prefix - bold and larger
  page.drawText(truncateText(`Item: ${asset.itemNumber}`, 28), {
    x: textX,
    y: textY,
    size: boldFontSize,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  textY -= lineHeight;

  // Model (always shown) - auto-fit to available width
  if (asset.model) {
    const modelText = asset.manufacturer?.name
      ? `${asset.manufacturer.name} ${asset.model}`
      : asset.model;
    const maxModelFontSize = 8;
    const minModelFontSize = 5;

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
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    textY -= lineHeight;
  }

  // Serial Number (always shown, under Model)
  if (asset.serialNumber) {
    page.drawText(truncateText(`S/N: ${asset.serialNumber}`, 30), {
      x: textX,
      y: textY,
      size: fontSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    textY -= lineHeight;
  }

  // Hostname and IP Address — combined on one line for Dymo, separate lines for Brother
  if (opts.labelSize === 'dymo-25x89') {
    if ((opts.showHostname && asset.hostname) || (opts.showIpAddress && asset.ipAddress)) {
      let hostIpText = '';
      if (opts.showHostname && asset.hostname) {
        hostIpText = asset.hostname;
      }
      if (opts.showIpAddress && asset.ipAddress) {
        hostIpText = hostIpText ? hostIpText + ' | ' + asset.ipAddress : asset.ipAddress;
      }
      page.drawText(truncateText(hostIpText, 50), {
        x: textX,
        y: textY,
        size: 7,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      textY -= lineHeight;
    }
  } else {
    if (opts.showHostname && asset.hostname) {
      page.drawText(truncateText(asset.hostname, 30), {
        x: textX,
        y: textY,
        size: fontSize,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      textY -= lineHeight;
    }

    if (opts.showIpAddress && asset.ipAddress) {
      page.drawText(truncateText(asset.ipAddress, 30), {
        x: textX,
        y: textY,
        size: fontSize,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      textY -= lineHeight;
    }
  }

  // Organization Name - centered at bottom, auto-fit to fill width
  if (asset.organizationName) {
    const orgText = asset.organizationName;
    const availableWidth = dims.widthPt - (margin * 2);
    const maxFontSize = 14;
    const minFontSize = 6;

    // Calculate font size to fit text within available width
    let orgFontSize = maxFontSize;
    let orgWidth = boldFont.widthOfTextAtSize(orgText, orgFontSize);

    // Scale down if text is too wide
    if (orgWidth > availableWidth) {
      orgFontSize = Math.max(minFontSize, (availableWidth / orgWidth) * maxFontSize);
      orgWidth = boldFont.widthOfTextAtSize(orgText, orgFontSize);
    }

    page.drawText(orgText, {
      x: (dims.widthPt - orgWidth) / 2,
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
  // For preview, we'll return the QR code with asset info encoded
  // A more sophisticated implementation could render the full label as an image
  const qrBuffer = await generateQRCode(asset.itemNumber, 200);
  return qrBuffer;
}

/**
 * Print a label to the specified printer using pdf-to-printer
 * Works in service context (SYSTEM user) where PowerShell verb methods fail
 */
export async function printLabel(
  pdfBytes: Uint8Array,
  printerName: string,
  labelSize: LabelSize = 'brother-29x62'
): Promise<void> {
  // Write PDF to temp file
  const tempPath = join(tmpdir(), `label-${Date.now()}.pdf`);
  writeFileSync(tempPath, Buffer.from(pdfBytes));

  try {
    // Use pdf-to-printer which works in SYSTEM user context (service)
    const dims = LABEL_DIMENSIONS[labelSize];
    const printOptions: any = {
      paperSize: dims.paperSize,
      scale: labelSize === 'dymo-25x89' ? 100 : 'fit',  // Dymo at 100%, Brother with fit
    };

    if (printerName) {
      printOptions.printer = printerName;
    }

    await print(tempPath, printOptions);
  } finally {
    // Clean up temp file after a delay to allow printing to complete
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

/**
 * Parse settings from key-value store format
 */
export function parseSettings(
  settingsMap: Map<string, string> | Record<string, string>
): LabelSettings {
  const get = (key: string) => {
    if (settingsMap instanceof Map) {
      return settingsMap.get(key);
    }
    return settingsMap[key];
  };

  const labelSizeRaw = get('label.labelSize');
  const validLabelSize: LabelSize = labelSizeRaw === 'dymo-25x89' ? 'dymo-25x89' : 'brother-29x62';

  return {
    printerName: get('label.printerName') || DEFAULT_SETTINGS.printerName,
    labelSize: validLabelSize,
    showAssignedTo: get('label.showAssignedTo') !== 'false',
    showHostname: get('label.showHostname') !== 'false',
    showIpAddress: get('label.showIpAddress') !== 'false',
    qrCodeContent: (get('label.qrCodeContent') === 'itemNumber' ? 'itemNumber' : 'full'),
  };
}

/**
 * Convert settings to key-value pairs for storage
 */
export function settingsToKeyValue(settings: Partial<LabelSettings>): Record<string, string> {
  const result: Record<string, string> = {};

  if (settings.printerName !== undefined) {
    result['label.printerName'] = settings.printerName;
  }
  if (settings.labelSize !== undefined) {
    result['label.labelSize'] = settings.labelSize;
  }
  if (settings.showAssignedTo !== undefined) {
    result['label.showAssignedTo'] = String(settings.showAssignedTo);
  }
  if (settings.showHostname !== undefined) {
    result['label.showHostname'] = String(settings.showHostname);
  }
  if (settings.showIpAddress !== undefined) {
    result['label.showIpAddress'] = String(settings.showIpAddress);
  }
  if (settings.qrCodeContent !== undefined) {
    result['label.qrCodeContent'] = settings.qrCodeContent;
  }

  return result;
}