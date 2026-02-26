import bwipjs from 'bwip-js';
import { Jimp } from 'jimp';

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
  qrCodeContent: 'itemNumber',
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
  if (opts.qrCodeContent === 'itemNumber') {
    return asset.itemNumber;
  }

  const lines: string[] = [];
  if (opts.showAssignedTo && asset.assignedTo) {
    lines.push(asset.assignedTo);
  }
  lines.push(`Item: ${asset.itemNumber}`);
  if (asset.model) {
    const modelText = asset.manufacturer?.name
      ? `${asset.manufacturer.name} ${asset.model}`
      : asset.model;
    lines.push(modelText);
  }
  if (asset.serialNumber) {
    lines.push(`S/N: ${asset.serialNumber}`);
  }
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
 * Create a DYMO label as a PNG image (964x270 pixels for 89x25mm label)
 * Returns PNG bytes as Uint8Array
 * For now: renders QR code on white background
 */
export async function createLabelPDF(
  asset: LabelAsset,
  settings: Partial<LabelSettings> = {}
): Promise<Uint8Array> {
  const opts = { ...DEFAULT_SETTINGS, ...settings };

  // Generate QR code (250x250 pixels)
  const qrContent = buildQRContent(asset, opts);
  const qrPng = await generateQRCode(qrContent, 250);

  // Create white canvas 964x270 (89mm x 25mm at ~274 DPI)
  const image = new Jimp({ width: 964, height: 270, color: 0xffffffff });

  // Load QR code and composite on the left side
  const qrJimp = await Jimp.read(qrPng);
  qrJimp.resize({ w: 250, h: 250 });

  // Composite at (10, 10)
  for (let y = 0; y < 250; y++) {
    for (let x = 0; x < 250; x++) {
      const pixel = qrJimp.getPixelColor(x, y);
      image.setPixelColor(pixel, 10 + x, 10 + y);
    }
  }

  // Add text info as barcode (using Code128 for item number)
  // This gives us readable machine-readable text on the right
  const barcodeBuffer = await generateBarcode(asset.itemNumber);
  const barcodeJimp = await Jimp.read(barcodeBuffer);
  barcodeJimp.resize({ w: 300, h: 80 });

  // Place barcode on the right side
  for (let y = 0; y < 80; y++) {
    for (let x = 0; x < 300; x++) {
      const pixel = barcodeJimp.getPixelColor(x, y);
      image.setPixelColor(pixel, 270 + x, 90 + y);
    }
  }

  // Return as PNG bytes
  const buffer = await image.getBuffer('image/png');
  return new Uint8Array(buffer);
}

/**
 * Create a label preview as PNG image
 */
export async function createLabelPreview(
  asset: LabelAsset,
  _settings: Partial<LabelSettings> = {}
): Promise<Buffer> {
  const qrBuffer = await generateQRCode(asset.itemNumber, 200);
  return qrBuffer;
}

/**
 * Print a label via node-dymo-printer
 * Accepts the PNG image bytes, loads into Jimp, and prints via DymoServices
 */
export async function printLabel(
  labelBytes: Uint8Array,
  printerName: string
): Promise<void> {
  try {
    console.log('[DYMO] Loading label image...');
    const jimpImage = await Jimp.read(Buffer.from(labelBytes));

    console.log('[DYMO] Connecting to printer:', printerName);

    // Dynamic import to handle ESM module
    const { DymoServices } = await import('node-dymo-printer');
    const dymo = new DymoServices({
      interface: 'WINDOWS',
      deviceId: printerName,
    });

    console.log('[DYMO] Printing label...');
    await dymo.print(jimpImage, 1);

    console.log('[DYMO] Label printed successfully');
  } catch (error) {
    console.error('[DYMO] Print error:', error);
    throw error;
  }
}

/**
 * Get list of available DYMO printers
 */
export async function getAvailablePrinters(): Promise<string[]> {
  try {
    console.log('[DYMO] Discovering printers...');

    // Dynamic import to handle ESM module
    const { DymoServices } = await import('node-dymo-printer');
    const dymo = new DymoServices();
    const printers = await dymo.listPrinters();

    if (printers && printers.length > 0) {
      const printerNames = printers.map((p: { name: string }) => p.name);
      console.log('[DYMO] Found printers:', printerNames);
      return printerNames;
    }

    console.log('[DYMO] No printers found');
    return [];
  } catch (error) {
    console.warn('[DYMO] Failed to list printers:', error instanceof Error ? error.message : String(error));
    return [];
  }
}
