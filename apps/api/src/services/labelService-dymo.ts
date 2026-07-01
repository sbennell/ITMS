import bwipjs from 'bwip-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { getPrinters, print } from 'pdf-to-printer';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Dymo 1933081 label dimensions: 23mm × 85mm (height × width)
// For landscape orientation: width = 85mm, height = 23mm
const LABEL_WIDTH_PT = 241;   // 85mm (width)
const LABEL_HEIGHT_PT = 65;   // 23mm (height)

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

function escapeXml(str: string): string {
  return str.replace(/[<>&'"]/g, c => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  }[c] || c));
}

/**
 * Build a native DYMO DieCutLabel XML for the Dymo 1933081 (1"x3.5" address-style)
 * label, printed directly through DYMO Label Software's local web service from the
 * browser. Coordinates are in twips (1440 per inch); label is 5040x1440 twips.
 */
export async function buildDymoLabelXml(asset: LabelAsset, settings: Partial<LabelSettings> = {}): Promise<string> {
  const opts = { ...DEFAULT_SETTINGS, ...settings };
  const qrContent = buildQRContent(asset, opts);
  // DYMO's native BarcodeObject doesn't reliably honor Bounds for QR sizing (its
  // internal "Size: Large" auto-sizing clips/shrinks unpredictably regardless of the
  // requested Bounds) - render the QR as a PNG instead and embed it as an ImageObject,
  // which scales predictably to Bounds via ScaleMode=Fill.
  const qrPngBase64 = (await generateQRCode(qrContent, 300)).toString('base64');

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

  <ObjectInfo>
    <ImageObject>
      <Name>QRCode</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <Image>${qrPngBase64}</Image>
      <ScaleMode>Fill</ScaleMode>
      <BorderWidth>0</BorderWidth>
      <BorderColor Alpha="255" Red="0" Green="0" Blue="0" />
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Center</VerticalAlignment>
    </ImageObject>
    <Bounds X="200" Y="100" Width="1134" Height="1134" />
  </ObjectInfo>

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
            <Font Family="Arial" Size="14" Bold="True" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="50" Y="130" Width="4940" Height="250" />
  </ObjectInfo>` : ''}

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
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="1370" Y="390" Width="3570" Height="170" />
  </ObjectInfo>

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
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="1370" Y="570" Width="3570" Height="160" />
  </ObjectInfo>` : ''}

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
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="1370" Y="735" Width="3570" Height="160" />
  </ObjectInfo>` : ''}

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
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="1370" Y="900" Width="3570" Height="150" />
  </ObjectInfo>` : ''}

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
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="1370" Y="1065" Width="3570" Height="150" />
  </ObjectInfo>` : ''}

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
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="50" Y="1270" Width="4940" Height="150" />
  </ObjectInfo>` : ''}

</DieCutLabel>`;
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

  // Layout: Centered text
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

  // Text centered horizontally in the space to the right of QR code
  let textY = LABEL_HEIGHT_PT - 13; // Start near top of label (moved down 0.2mm to avoid cutoff)
  const qrAreaEnd = margin + qrSize + 1; // End of QR code area (~17mm)
  const textAreaStart = qrAreaEnd;
  const textAreaEnd = LABEL_WIDTH_PT - margin;
  const labelCenterX = textAreaStart + ((textAreaEnd - textAreaStart) / 2);

  // Text styling - increased sizes
  const fontSize = 10;
  const boldFontSize = 10;
  const assignedToFontSize = 10;
  const lineHeight = 9;
  const textAreaWidth = LABEL_WIDTH_PT - (margin * 2); // Available width for centered text

  // Assigned To (if present) - centered
  if (opts.showAssignedTo && asset.assignedTo) {
    const assignedText = truncateText(asset.assignedTo, 28);
    const assignedWidth = boldFont.widthOfTextAtSize(assignedText, assignedToFontSize);
    const assignedX = labelCenterX - (assignedWidth / 2);

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
  const itemText = truncateText(`Item: ${asset.itemNumber}`, 25);
  const itemWidth = regularFont.widthOfTextAtSize(itemText, boldFontSize);
  const itemX = labelCenterX - (itemWidth / 2);

  page.drawText(itemText, {
    x: itemX,
    y: textY,
    size: boldFontSize,
    font: regularFont,
    color: rgb(0, 0, 0),
  });
  textY -= lineHeight;

  // Model (always shown) - auto-fit and centered
  if (asset.model) {
    const modelText = asset.manufacturer?.name
      ? `${asset.manufacturer.name} ${asset.model}`
      : asset.model;
    const maxModelFontSize = 11;
    const minModelFontSize = 4;

    // Calculate font size to fit text within available width
    let modelFontSize = maxModelFontSize;
    let modelWidth = regularFont.widthOfTextAtSize(modelText, modelFontSize);

    // Scale down if text is too wide
    if (modelWidth > textAreaWidth) {
      modelFontSize = Math.max(minModelFontSize, (textAreaWidth / modelWidth) * maxModelFontSize);
      modelWidth = regularFont.widthOfTextAtSize(modelText, modelFontSize);
    }

    const modelX = labelCenterX - (modelWidth / 2);
    page.drawText(modelText, {
      x: modelX,
      y: textY,
      size: modelFontSize,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
    textY -= lineHeight;
  }

  // Serial Number (always shown, under Model) - centered
  if (asset.serialNumber) {
    const snText = truncateText(`S/N: ${asset.serialNumber}`, 25);
    const snWidth = regularFont.widthOfTextAtSize(snText, fontSize);
    const snX = labelCenterX - (snWidth / 2);

    page.drawText(snText, {
      x: snX,
      y: textY,
      size: fontSize,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
    textY -= lineHeight;
  }

  // Hostname and IP Address on same line - centered
  if ((opts.showHostname && asset.hostname) || (opts.showIpAddress && asset.ipAddress)) {
    let hostIpText = '';
    if (opts.showHostname && asset.hostname) {
      hostIpText = asset.hostname;
    }
    if (opts.showIpAddress && asset.ipAddress) {
      if (hostIpText) {
        hostIpText += ' \\ ' + asset.ipAddress;
      } else {
        hostIpText = asset.ipAddress;
      }
    }
    const hostIpFullText = truncateText(hostIpText, 40);
    const hostIpWidth = regularFont.widthOfTextAtSize(hostIpFullText, fontSize);
    const hostIpX = labelCenterX - (hostIpWidth / 2);

    page.drawText(hostIpFullText, {
      x: hostIpX,
      y: textY,
      size: fontSize,
      font: regularFont,
      color: rgb(0, 0, 0),
    });
    textY -= lineHeight;
  }

  // Organization Name - centered
  if (asset.organizationName && textY > 3) {
    const orgText = truncateText(asset.organizationName, 40);
    const orgWidth = boldFont.widthOfTextAtSize(orgText, fontSize);
    const orgX = labelCenterX - (orgWidth / 2);

    page.drawText(orgText, {
      x: orgX,
      y: textY,
      size: fontSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    textY -= lineHeight;
  }

  return doc.save();
}

/**
 * Create a label preview as PNG image
 * Returns the QR code that will be on the label
 */
export async function createLabelPreview(
  asset: LabelAsset,
  settings: Partial<LabelSettings> = {}
): Promise<Buffer> {
  const qrContent = buildQRContent(asset, { ...DEFAULT_SETTINGS, ...settings });
  const qrBuffer = await generateQRCode(qrContent, 200);
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
    // Use pdf-to-printer with Dymo paper size (23mm x 89mm)
    const printOptions: any = {
      paperSize: '23x89mm',
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
