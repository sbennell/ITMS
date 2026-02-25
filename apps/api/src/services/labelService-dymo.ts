import bwipjs from 'bwip-js';
import { getPrinters } from 'pdf-to-printer';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';


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
 * Create a DYMO label as XML string, returned as UTF-8 bytes
 * Generates a .label file format for 25mm × 89mm landscape label
 */
export async function createLabelPDF(
  asset: LabelAsset,
  settings: Partial<LabelSettings> = {}
): Promise<Uint8Array> {
  const opts = { ...DEFAULT_SETTINGS, ...settings };

  // Build QR content
  const qrContent = buildQRContent(asset, opts);

  // Escape XML special characters
  const escapeXml = (str: string): string => {
    return str.replace(/[&<>"']/g, (char) => {
      const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      };
      return map[char];
    });
  };

  // Build text objects conditionally
  const textObjects: string[] = [];
  let yPosition = 100; // Starting Y position in twips

  // Item Number - bold, larger
  textObjects.push(`
    <TextObject>
      <Name>ItemNumber</Name>
      <Rotation>Rotation0</Rotation>
      <Text>${escapeXml(`Item: ${asset.itemNumber}`)}</Text>
      <Bounds X="300" Y="${yPosition}" Width="4500" Height="300"/>
      <Alignment>Left</Alignment>
      <StyledText>
        <Element>
          <String>${escapeXml(`Item: ${asset.itemNumber}`)}</String>
          <Attributes>
            <Font Family="Arial" Size="12" Bold="True"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>`);
  yPosition += 350;

  // Model
  if (asset.model) {
    const modelText = asset.manufacturer?.name
      ? `${asset.manufacturer.name} ${asset.model}`
      : asset.model;
    textObjects.push(`
    <TextObject>
      <Name>Model</Name>
      <Rotation>Rotation0</Rotation>
      <Text>${escapeXml(modelText)}</Text>
      <Bounds X="300" Y="${yPosition}" Width="4500" Height="250"/>
      <Alignment>Left</Alignment>
      <StyledText>
        <Element>
          <String>${escapeXml(modelText)}</String>
          <Attributes>
            <Font Family="Arial" Size="10"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>`);
    yPosition += 300;
  }

  // Serial Number
  if (asset.serialNumber) {
    textObjects.push(`
    <TextObject>
      <Name>SerialNumber</Name>
      <Rotation>Rotation0</Rotation>
      <Text>${escapeXml(`S/N: ${asset.serialNumber}`)}</Text>
      <Bounds X="300" Y="${yPosition}" Width="4500" Height="250"/>
      <Alignment>Left</Alignment>
      <StyledText>
        <Element>
          <String>${escapeXml(`S/N: ${asset.serialNumber}`)}</String>
          <Attributes>
            <Font Family="Arial" Size="10"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>`);
    yPosition += 300;
  }

  // Hostname
  if (opts.showHostname && asset.hostname) {
    textObjects.push(`
    <TextObject>
      <Name>Hostname</Name>
      <Rotation>Rotation0</Rotation>
      <Text>${escapeXml(asset.hostname)}</Text>
      <Bounds X="300" Y="${yPosition}" Width="4500" Height="250"/>
      <Alignment>Left</Alignment>
      <StyledText>
        <Element>
          <String>${escapeXml(asset.hostname)}</String>
          <Attributes>
            <Font Family="Arial" Size="10"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>`);
    yPosition += 300;
  }

  // IP Address
  if (opts.showIpAddress && asset.ipAddress) {
    textObjects.push(`
    <TextObject>
      <Name>IpAddress</Name>
      <Rotation>Rotation0</Rotation>
      <Text>${escapeXml(asset.ipAddress)}</Text>
      <Bounds X="300" Y="${yPosition}" Width="4500" Height="250"/>
      <Alignment>Left</Alignment>
      <StyledText>
        <Element>
          <String>${escapeXml(asset.ipAddress)}</String>
          <Attributes>
            <Font Family="Arial" Size="10"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>`);
    yPosition += 300;
  }

  // Assigned To
  if (opts.showAssignedTo && asset.assignedTo) {
    textObjects.push(`
    <TextObject>
      <Name>AssignedTo</Name>
      <Rotation>Rotation0</Rotation>
      <Text>${escapeXml(asset.assignedTo)}</Text>
      <Bounds X="300" Y="${yPosition}" Width="4500" Height="250"/>
      <Alignment>Left</Alignment>
      <StyledText>
        <Element>
          <String>${escapeXml(asset.assignedTo)}</String>
          <Attributes>
            <Font Family="Arial" Size="10"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>`);
    yPosition += 300;
  }

  // Organization Name (if present)
  if (asset.organizationName) {
    textObjects.push(`
    <TextObject>
      <Name>Organization</Name>
      <Rotation>Rotation0</Rotation>
      <Text>${escapeXml(asset.organizationName)}</Text>
      <Bounds X="300" Y="4950" Width="4500" Height="200"/>
      <Alignment>Center</Alignment>
      <StyledText>
        <Element>
          <String>${escapeXml(asset.organizationName)}</String>
          <Attributes>
            <Font Family="Arial" Size="9"/>
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>`);
  }

  // Build QR barcode object
  const qrObject = `
    <BarcodeObject>
      <Name>QRCode</Name>
      <Rotation>Rotation0</Rotation>
      <Text>${escapeXml(qrContent)}</Text>
      <Type>QRCode</Type>
      <Bounds X="100" Y="500" Width="1200" Height="1200"/>
      <TextPosition>None</TextPosition>
    </BarcodeObject>`;

  // Construct complete .label XML
  const labelXml = `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>DYMO-1933081</Id>
  <PaperName>25mm x 89mm</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="5040" Height="1417" Rx="270" Ry="270"/>
  </DrawCommands>
  <ObjectInfo>
    ${qrObject}
${textObjects.join('')}
  </ObjectInfo>
</DieCutLabel>`;

  if (process.env.DEBUG_DYMO) {
    console.log('[DYMO] Generated label XML:', labelXml);
  }

  // Return as UTF-8 encoded bytes
  return new Uint8Array(Buffer.from(labelXml, 'utf-8'));
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
 * Print a label to the specified printer using DYMO Label Software (DLS.exe)
 */
export async function printLabel(
  labelBytes: Uint8Array,
  printerName: string
): Promise<void> {
  // Write .label XML to temp file
  const tempPath = join(tmpdir(), `label-dymo-${Date.now()}.label`);
  writeFileSync(tempPath, Buffer.from(labelBytes));

  try {
    // Get DLS.exe path from environment or use standard installation path
    const dlsPath = process.env.DYMO_DLS_PATH ?? `C:\\Program Files (x86)\\DYMO\\DYMO Label Software\\DLS.exe`;

    // Build command arguments
    const args = ['/p', tempPath];
    if (printerName) {
      args.push('/printer', printerName);
    }

    console.log('[DYMO] Printing label:', { dlsPath, tempPath, printerName, args });

    // Execute DLS.exe asynchronously
    await new Promise<void>((resolve, reject) => {
      execFile(dlsPath, args, { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          console.error('[DYMO] DLS.exe execution failed:', error);
          console.error('[DYMO] stderr:', stderr);
          console.error('[DYMO] stdout:', stdout);
          reject(error);
        } else {
          console.log('[DYMO] Label printed successfully');
          resolve();
        }
      });
    });
  } catch (error) {
    console.error('[DYMO] Failed to print label:', error);
    throw error;
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

