import bwipjs from 'bwip-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import https from 'https';

// Dymo 1933081 label dimensions: 25mm × 89mm
const LABEL_WIDTH_PT = 252;   // 89mm (width)
const LABEL_HEIGHT_PT = 71;   // 25mm (height)

// DYMO WebService constants
const DYMO_BASE = 'https://127.0.0.1:41951/DYMO/DLS/Printing';

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
 * DYMO WebService HTTP helper - uses https.Agent to bypass self-signed cert
 */
async function dymoFetch(path: string, method: string = 'GET', body?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const url = new URL(`${DYMO_BASE}${path}`);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      agent: agent,
      headers: method === 'POST' ? {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body || ''),
      } : {},
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          console.error(`[DYMO API] ${method} ${path} returned ${res.statusCode}`);
          console.error(`[DYMO API] Response:`, data);
          reject(new Error(`DYMO WebService error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) {
      console.log(`[DYMO API] ${method} ${path}`);
      console.log(`[DYMO API] Body length: ${Buffer.byteLength(body)} bytes`);
      req.write(body);
    }
    req.end();
  });
}

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
 * Build DYMO XML label for printing (Dymo 1933081: 30252 Address label, 1"×3.5")
 * Coordinates in twips (1440 per inch). Label landscape: 5040×1440 twips.
 */
function buildDymoLabelXml(asset: LabelAsset, opts: LabelSettings): string {
  const qrContent = buildQRContent(asset, opts);
  const escapeXml = (str: string) => str.replace(/[<>&'"]/g, c => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  }[c] || c));

  const assignedText = opts.showAssignedTo && asset.assignedTo
    ? escapeXml(asset.assignedTo.substring(0, 28))
    : '';
  const itemText = `Item: ${escapeXml(asset.itemNumber.substring(0, 25))}`;
  const modelText = asset.model
    ? escapeXml((asset.manufacturer?.name ? `${asset.manufacturer.name} ` : '') + asset.model)
    : '';
  const serialText = asset.serialNumber
    ? `S/N: ${escapeXml(asset.serialNumber.substring(0, 25))}`
    : '';
  const hostnameText = opts.showHostname && asset.hostname
    ? escapeXml(asset.hostname.substring(0, 30))
    : '';
  const ipText = opts.showIpAddress && asset.ipAddress
    ? escapeXml(asset.ipAddress.substring(0, 30))
    : '';
  const orgText = asset.organizationName
    ? escapeXml(asset.organizationName.substring(0, 40))
    : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Address</Id>
  <PaperName>30252 Address</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="5040" Height="1440" Rx="270" Ry="270" />
  </DrawCommands>

  <!-- QR Code on the left: ~22mm square -->
  <ObjectInfo>
    <BarcodeObject>
      <Name>QRCode</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <Text>${escapeXml(qrContent)}</Text>
      <Type>QRCode</Type>
      <Size>Large</Size>
      <TextPosition>None</TextPosition>
      <TextFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <CheckSumFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <TextEmbedding>None</TextEmbedding>
      <ECLevel>0</ECLevel>
      <HorizontalAlignment>Center</HorizontalAlignment>
    </BarcodeObject>
    <Bounds X="50" Y="50" Width="1200" Height="1200" />
  </ObjectInfo>

  <!-- Assigned To - top, centered full width -->
  ${assignedText ? `<ObjectInfo>
    <TextObject>
      <Name>AssignedTo</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${assignedText}</String>
          <Attributes>
            <Font Family="Arial" Size="10" Bold="True" Italic="False" Underline="False" Strikeout="False" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="50" Y="30" Width="4940" Height="180" />
  </ObjectInfo>` : ''}

  <!-- Item Number -->
  <ObjectInfo>
    <TextObject>
      <Name>ItemNumber</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${itemText}</String>
          <Attributes>
            <Font Family="Arial" Size="9" Bold="True" Italic="False" Underline="False" Strikeout="False" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="1340" Y="220" Width="3600" Height="170" />
  </ObjectInfo>

  <!-- Model -->
  ${modelText ? `<ObjectInfo>
    <TextObject>
      <Name>Model</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${modelText}</String>
          <Attributes>
            <Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="1340" Y="400" Width="3600" Height="160" />
  </ObjectInfo>` : ''}

  <!-- Serial Number -->
  ${serialText ? `<ObjectInfo>
    <TextObject>
      <Name>SerialNumber</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${serialText}</String>
          <Attributes>
            <Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="1340" Y="565" Width="3600" Height="160" />
  </ObjectInfo>` : ''}

  <!-- Hostname -->
  ${hostnameText ? `<ObjectInfo>
    <TextObject>
      <Name>Hostname</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${hostnameText}</String>
          <Attributes>
            <Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="1340" Y="730" Width="3600" Height="150" />
  </ObjectInfo>` : ''}

  <!-- IP Address -->
  ${ipText ? `<ObjectInfo>
    <TextObject>
      <Name>IPAddress</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${ipText}</String>
          <Attributes>
            <Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="1340" Y="895" Width="3600" Height="150" />
  </ObjectInfo>` : ''}

  <!-- Organization Name - bottom, centered full width -->
  ${orgText ? `<ObjectInfo>
    <TextObject>
      <Name>OrgName</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${orgText}</String>
          <Attributes>
            <Font Family="Arial" Size="7" Bold="False" Italic="False" Underline="False" Strikeout="False" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="50" Y="1270" Width="4940" Height="150" />
  </ObjectInfo>` : ''}

</DieCutLabel>`;
}

/**
 * Create a label PDF for an asset (for download - unchanged)
 */
export async function createLabelPDF(
  asset: LabelAsset,
  settings: Partial<LabelSettings> = {}
): Promise<Uint8Array> {
  const opts = { ...DEFAULT_SETTINGS, ...settings };

  // Generate QR code
  const qrContent = buildQRContent(asset, opts);
  const qrBuffer = await generateQRCode(qrContent, 120);

  // Create PDF document
  const doc = await PDFDocument.create();
  const page = doc.addPage([LABEL_WIDTH_PT, LABEL_HEIGHT_PT]);

  // Embed bold font
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  // Embed QR code image
  const qrImage = await doc.embedPng(qrBuffer);

  // Layout: Landscape - QR on left, text on right
  const margin = 3;
  const qrSize = 45;

  // QR code on LEFT
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
  let textY = LABEL_HEIGHT_PT - 10;

  // Text styling
  const fontSize = 12;
  const boldFontSize = 12;
  const assignedToFontSize = 12;
  const lineHeight = 9.5;
  const textAreaWidth = LABEL_WIDTH_PT - textX - margin;

  // Assigned To - centered across full label width
  if (opts.showAssignedTo && asset.assignedTo) {
    const assignedText = asset.assignedTo.substring(0, 28);
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

  // Item Number - bold
  page.drawText(`Item: ${asset.itemNumber.substring(0, 25)}`, {
    x: textX,
    y: textY,
    size: boldFontSize,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  textY -= lineHeight;

  // Model
  if (asset.model) {
    const modelText = asset.manufacturer?.name
      ? `${asset.manufacturer.name} ${asset.model}`
      : asset.model;
    let modelFontSize = 12;
    let modelWidth = boldFont.widthOfTextAtSize(modelText, modelFontSize);

    if (modelWidth > textAreaWidth) {
      modelFontSize = Math.max(5, (textAreaWidth / modelWidth) * 12);
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

  // Serial Number
  if (asset.serialNumber) {
    page.drawText(`S/N: ${asset.serialNumber.substring(0, 25)}`, {
      x: textX,
      y: textY,
      size: fontSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    textY -= lineHeight;
  }

  // Hostname
  if (opts.showHostname && asset.hostname) {
    page.drawText(asset.hostname.substring(0, 30), {
      x: textX,
      y: textY,
      size: fontSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    textY -= lineHeight;
  }

  // IP Address
  if (opts.showIpAddress && asset.ipAddress) {
    page.drawText(asset.ipAddress.substring(0, 30), {
      x: textX,
      y: textY,
      size: fontSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    textY -= lineHeight;
  }

  // Organization Name - centered at bottom
  if (asset.organizationName && textY > 3) {
    const orgText = asset.organizationName.substring(0, 40);
    let orgFontSize = 12;
    let orgWidth = boldFont.widthOfTextAtSize(orgText, orgFontSize);
    const fullLabelWidth = LABEL_WIDTH_PT - (margin * 2);

    if (orgWidth > fullLabelWidth) {
      orgFontSize = Math.max(5, (fullLabelWidth / orgWidth) * 12);
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
 * Print a label via DYMO WebService
 */
export async function printLabel(
  asset: LabelAsset,
  settings: LabelSettings,
  printerName: string,
  copies: number = 1
): Promise<void> {
  // Validate printer name
  if (!printerName || printerName.trim() === '') {
    throw new Error('Printer name is required. Please configure a printer in Settings > Label Printing');
  }

  // Strip UNC path prefix if present (e.g., \\server\DYMO printer -> DYMO printer)
  let cleanPrinterName = printerName.trim();
  if (cleanPrinterName.startsWith('\\\\')) {
    const parts = cleanPrinterName.split('\\');
    cleanPrinterName = parts[parts.length - 1];
  }

  const labelXml = buildDymoLabelXml(asset, settings);

  const printParamsXml = `<LabelWriterPrintParams>
    <Copies>${copies}</Copies>
    <JobTitle>Asset Label</JobTitle>
    <FlowDirection>LeftToRight</FlowDirection>
    <PrintQuality>Text</PrintQuality>
  </LabelWriterPrintParams>`;

  // DYMO API parameter names - try different formats based on SDK docs
  const body = new URLSearchParams({
    printerName: cleanPrinterName,
    labelXml: labelXml,
    printParamsXml: printParamsXml,
  });

  try {
    const bodyStr = body.toString();
    console.log(`[DYMO] Printing to printer: ${cleanPrinterName}`);
    console.log(`[DYMO] Label XML length: ${labelXml.length} chars`);
    console.log(`[DYMO] PrintParams XML length: ${printParamsXml.length} chars`);
    console.log(`[DYMO] Total body size: ${bodyStr.length} bytes`);
    console.log(`[DYMO] Body keys:`, bodyStr.split('&').map(p => p.split('=')[0]));
    console.log(`[DYMO] Sending POST to /PrintLabel`);
    await dymoFetch('/PrintLabel', 'POST', bodyStr);
    console.log(`[DYMO] Label printed successfully for asset ${asset.itemNumber}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[DYMO] Print error for ${asset.itemNumber}:`, errorMsg);
    throw new Error(`Failed to print label via DYMO WebService: ${errorMsg}`);
  }
}

/**
 * Get list of available printers from DYMO WebService
 */
export async function getAvailablePrinters(): Promise<string[]> {
  try {
    const xml = await dymoFetch('/GetPrinters', 'GET');
    const matches = xml.match(/<Name>([^<]+)<\/Name>/g) || [];
    return matches.map((m: string) => m.replace(/<\/?Name>/g, ''));
  } catch (error) {
    console.error('Failed to get DYMO printers:', error);
    return [];
  }
}
