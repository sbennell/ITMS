import bwipjs from 'bwip-js';

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
 * Create a DYMO label as a PNG image
 * Generates QR code as the label content
 */
export async function createLabelPDF(
  asset: LabelAsset,
  settings: Partial<LabelSettings> = {}
): Promise<Uint8Array> {
  const opts = { ...DEFAULT_SETTINGS, ...settings };

  // Generate QR code with item info
  const qrContent = buildQRContent(asset, opts);
  const qrBuffer = await generateQRCode(qrContent, 300);

  // Return QR code as label (node-dymo-printer will handle scaling and printing)
  return new Uint8Array(qrBuffer);
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
 * Uses NETWORK interface to connect directly to printer via TCP port 9100
 */
export async function printLabel(
  labelBytes: Uint8Array,
  printerName: string
): Promise<void> {
  try {
    console.log('[DYMO] Loading label image and printer service...');

    // Dynamic import to handle ESM module
    const { DymoServices, loadImage } = await import('node-dymo-printer');

    // Load the PNG image from buffer
    const image = await loadImage(Buffer.from(labelBytes));

    // Extract IP address from printer name if it's a network path like \\10.142.197.18\DYMO...
    let printerHost = '10.142.197.18'; // Default to known network printer IP
    const ipMatch = printerName.match(/\\?([\d.]+)\\/);
    if (ipMatch && ipMatch[1]) {
      printerHost = ipMatch[1];
    }

    console.log('[DYMO] Connecting to printer at:', printerHost);
    const dymo = new DymoServices({
      interface: 'NETWORK',
      host: printerHost,
      port: 9100, // Standard JetDirect port for DYMO printers
    });

    console.log('[DYMO] Printing label...');
    await dymo.print(image, 1);

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
