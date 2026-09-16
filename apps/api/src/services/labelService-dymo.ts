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

interface LabelFields {
  qrContent: string;
  assignedText: string;
  itemText: string;
  modelText: string;
  serialText: string;
  hostIpText: string;
  orgText: string;
}

// Shared by both label builders below (DieCutLabel twips schema and the LabelManager's
// DesktopLabel inches schema) so the two devices show the same asset fields.
function deriveLabelFields(asset: LabelAsset, opts: LabelSettings): LabelFields {
  const qrContent = buildQRContent(asset, opts);
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
  let hostIpText = hostnameText;
  if (ipText) {
    hostIpText = hostIpText ? `${hostIpText} \\ ${ipText}` : ipText;
  }
  const orgText = asset.organizationName
    ? escapeXml(asset.organizationName.substring(0, 40))
    : '';
  return { qrContent, assignedText, itemText, modelText, serialText, hostIpText, orgText };
}

interface AddressLabelLayout {
  paperName: string;
  widthTwips: number;
  heightTwips: number;
}

// Base layout below is authored for the Dymo 1933081 canvas (5040x1440 twips, i.e.
// 1"x3.5" at 1440 twips/inch) and scaled per-axis for other label sizes (e.g. the
// LabelManager Executive 640's 24mm tape), so both labels share one template.
const BASE_WIDTH_TWIPS = 5040;
const BASE_HEIGHT_TWIPS = 1440;

/**
 * Build a native DYMO DieCutLabel XML, printed directly through DYMO Label
 * Software's local web service from the browser. Coordinates are in twips (1440
 * per inch). Shared by the Dymo 1933081 (LabelWriter) and LabelManager Executive
 * 640 (tape) label builders below, scaled to each device's label dimensions.
 */
async function buildAddressStyleLabelXml(
  asset: LabelAsset,
  settings: Partial<LabelSettings>,
  layout: AddressLabelLayout
): Promise<string> {
  const opts = { ...DEFAULT_SETTINGS, ...settings };
  const sx = layout.widthTwips / BASE_WIDTH_TWIPS;
  const sy = layout.heightTwips / BASE_HEIGHT_TWIPS;
  const scX = (n: number) => Math.round(n * sx);
  const scY = (n: number) => Math.round(n * sy);
  const scFont = (n: number) => Math.max(4, Math.round(n * sy));
  const { qrContent, assignedText, itemText, modelText, serialText, hostIpText, orgText } = deriveLabelFields(asset, opts);
  // DYMO's native BarcodeObject doesn't reliably honor Bounds for QR sizing (its
  // internal "Size: Large" auto-sizing clips/shrinks unpredictably regardless of the
  // requested Bounds) - render the QR as a PNG instead and embed it as an ImageObject,
  // which scales predictably to Bounds via ScaleMode=Fill.
  const qrPngBase64 = (await generateQRCode(qrContent, 300)).toString('base64');

  // When Hostname/IP isn't shown, redistribute its row to Item Number/Model/Serial
  // Number instead of leaving the space blank.
  const hasHostIp = !!hostIpText;
  const itemModelSerialSize = hasHostIp ? 10 : 13;
  const itemModelSerialHeight = hasHostIp ? 200 : 260;
  const itemY = 390;
  const qrX = 370;
  const qrY = 214;
  const qrSize = 1134;
  const textX = 1520;
  const textWidth = 3420;
  const modelY = hasHostIp ? 600 : 665;
  const serialY = hasHostIp ? 810 : 940;
  const hostIpY = 1020;
  const hostIpHeight = 200;
  const orgX = textX;
  const orgY = 1247;
  const orgWidth = textWidth;
  const orgHeight = 250;
  const hostIpSize = 10;

  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Address</Id>
  <PaperName>${layout.paperName}</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="${layout.widthTwips}" Height="${layout.heightTwips}" Rx="${scY(270)}" Ry="${scY(270)}" />
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
    <Bounds X="${scX(qrX)}" Y="${scY(qrY)}" Width="${scX(qrSize)}" Height="${scY(qrSize)}" />
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
            <Font Family="Arial" Size="${scFont(14)}" Bold="True" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${scX(textX)}" Y="${scY(130)}" Width="${scX(textWidth)}" Height="${scY(250)}" />
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
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${itemText}</String>
          <Attributes>
            <Font Family="Arial" Size="${scFont(itemModelSerialSize)}" Bold="True" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${scX(textX)}" Y="${scY(itemY)}" Width="${scX(textWidth)}" Height="${scY(itemModelSerialHeight)}" />
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
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${modelText}</String>
          <Attributes>
            <Font Family="Arial" Size="${scFont(itemModelSerialSize)}" Bold="False" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${scX(textX)}" Y="${scY(modelY)}" Width="${scX(textWidth)}" Height="${scY(itemModelSerialHeight)}" />
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
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${serialText}</String>
          <Attributes>
            <Font Family="Arial" Size="${scFont(itemModelSerialSize)}" Bold="False" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${scX(textX)}" Y="${scY(serialY)}" Width="${scX(textWidth)}" Height="${scY(itemModelSerialHeight)}" />
  </ObjectInfo>` : ''}

  ${hostIpText ? `<ObjectInfo>
    <TextObject>
      <Name>HostnameIP</Name>
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
          <String>${hostIpText}</String>
          <Attributes>
            <Font Family="Arial" Size="${scFont(hostIpSize)}" Bold="False" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${scX(textX)}" Y="${scY(hostIpY)}" Width="${scX(textWidth)}" Height="${scY(hostIpHeight)}" />
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
            <Font Family="Arial" Size="${scFont(14)}" Bold="True" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${scX(orgX)}" Y="${scY(orgY)}" Width="${scX(orgWidth)}" Height="${scY(orgHeight)}" />
  </ObjectInfo>` : ''}

</DieCutLabel>`;
}

/**
 * Build a native DYMO DieCutLabel XML for the Dymo 1933081 (1"x3.5" address-style)
 * label, printed directly through DYMO Label Software's local web service from the
 * browser. Coordinates are in twips (1440 per inch); label is 5040x1440 twips.
 */
export async function buildDymoLabelXml(asset: LabelAsset, settings: Partial<LabelSettings> = {}): Promise<string> {
  return buildAddressStyleLabelXml(asset, settings, {
    paperName: '30252 Address',
    widthTwips: BASE_WIDTH_TWIPS,
    heightTwips: BASE_HEIGHT_TWIPS,
  });
}

// The LabelManager Executive 640 is a continuous D1-tape device, not a die-cut
// LabelWriter - DYMO Connect only accepts continuous-media labels in its newer
// DesktopLabel/DYMOLabel/GrowingDynamicLayoutManager schema (inches, not twips; see
// buildAddressStyleLabelXml above for the twips-based DieCutLabel schema used by the
// 1933081). The constants below (tape preset name, box positions/sizes, fixed print
// length) were read directly off a label exported from DYMO Connect Desktop after
// manual tuning for this printer/tape - they aren't values we chose, so they should
// hold for any label using the same cassette. Layout is a QR box top-left, a details
// text box to its right (Assigned To/Item/Model/Serial) separated by a vertical divider
// line, and an organization-name row spanning the full width underneath separated by a
// horizontal divider line. Unlike earlier revisions, this one prints at a fixed tape
// length rather than growing to fit content.
const LABELMANAGER_TAPE_NAME = '24X7-TAPE BLACK/WHITE';
const LABELMANAGER_INITIAL_LENGTH_IN = 1.57; // starting canvas length baked into the export
const LABELMANAGER_FIXED_LENGTH_IN = 2.8740158; // total printed tape length - fixed, not auto-grown per content
const LABELMANAGER_LEADER_IN = 0.41666666; // 10mm leader/trailer (DYMO's "Center" tape alignment)
const LABELMANAGER_TOP_MARGIN_IN = 0.116666645; // vertical inset baked into the 24mm tape preset
const LABELMANAGER_CONTENT_WIDTH_IN = 2.0406823; // DYMORect width (drives the visible border box)
const LABELMANAGER_CONTENT_HEIGHT_IN = 0.71111107; // usable print height for 24mm tape

const LABELMANAGER_QR_X_IN = 0.44319782;
const LABELMANAGER_QR_Y_IN = 0.16940038;
const LABELMANAGER_QR_WIDTH_IN = 0.48812515;
const LABELMANAGER_QR_HEIGHT_IN = 0.4701397;

const LABELMANAGER_DETAILS_X_IN = 1.0033197;
const LABELMANAGER_DETAILS_Y_IN = 0.14856686;
const LABELMANAGER_DETAILS_WIDTH_IN = 1.4405458;
const LABELMANAGER_DETAILS_HEIGHT_IN = 0.5118067;

const LABELMANAGER_ORG_X_IN = 0.41666672;
const LABELMANAGER_ORG_Y_IN = 0.6805556;
const LABELMANAGER_ORG_WIDTH_IN = 2.0271986;
const LABELMANAGER_ORG_HEIGHT_IN = 0.125;

const LABELMANAGER_HDIVIDER_X_IN = 0.4166667;
const LABELMANAGER_HDIVIDER_Y_IN = 0.63055557;
const LABELMANAGER_HDIVIDER_WIDTH_IN = 2.0395784;
const LABELMANAGER_HDIVIDER_HEIGHT_IN = 0.10781264;

const LABELMANAGER_VDIVIDER_X_IN = 0.8547918;
const LABELMANAGER_VDIVIDER_Y_IN = 0.11927137;
const LABELMANAGER_VDIVIDER_WIDTH_IN = 0.21237853;
const LABELMANAGER_VDIVIDER_HEIGHT_IN = 0.5638892;

function dymoBrush(r: number, g: number, b: number, a: number = 1): string {
  return `<SolidColorBrush><Color A="${a}" R="${r}" G="${g}" B="${b}"></Color></SolidColorBrush>`;
}
// The manually-tuned export uses this single near-black tone for every stroke, fill,
// border, and font color on the label (QR, text, dividers, and the outer border alike).
const LABELMANAGER_INK_BRUSH = dymoBrush(0.13725491, 0.12156863, 0.1254902, 1);
const LABELMANAGER_INK_TRANSPARENT_BRUSH = dymoBrush(0.13725491, 0.12156863, 0.1254902, 0);
const LABELMANAGER_TRANSPARENT_BRUSH = dymoBrush(0, 0, 0, 0);

function buildDividerLine(name: string, lineType: 'Horizontal' | 'Vertical', x: number, y: number, width: number, height: number): string {
  return `<LineObject>
          <Name>${name}</Name>
          <Brushes>
            <BackgroundBrush>${LABELMANAGER_INK_TRANSPARENT_BRUSH}</BackgroundBrush>
            <BorderBrush>${LABELMANAGER_INK_BRUSH}</BorderBrush>
            <StrokeBrush>${LABELMANAGER_INK_BRUSH}</StrokeBrush>
            <FillBrush>${LABELMANAGER_INK_TRANSPARENT_BRUSH}</FillBrush>
          </Brushes>
          <Rotation>Rotation0</Rotation>
          <OutlineThickness>1</OutlineThickness>
          <IsOutlined>False</IsOutlined>
          <BorderStyle>SolidLine</BorderStyle>
          <Margin><DYMOThickness Left="0" Top="0" Right="0" Bottom="0" /></Margin>
          <StrokeWidth>1</StrokeWidth>
          <DashPattern>SolidLine</DashPattern>
          <LineType>${lineType}</LineType>
          <ObjectLayout>
            <DYMOPoint>
              <X>${x}</X>
              <Y>${y}</Y>
            </DYMOPoint>
            <Size>
              <Width>${width}</Width>
              <Height>${height}</Height>
            </Size>
          </ObjectLayout>
        </LineObject>`;
}

/**
 * Build a native DYMO label XML for the LabelManager Executive 640 (24mm tape),
 * printed via DYMO Connect's Tape printer API (see dymoLabelPrinter.ts). Uses a
 * native QRCodeObject - DYMO renders the QR itself - rather than the rasterized-PNG
 * workaround the DieCutLabel schema above needs for its BarcodeObject.
 */
export async function buildDymoLabelManagerXml(asset: LabelAsset, settings: Partial<LabelSettings> = {}): Promise<string> {
  const opts = { ...DEFAULT_SETTINGS, ...settings };
  // Hostname/IP isn't offered for this tape - too little width for it - so it's
  // omitted here regardless of the showHostname/showIpAddress settings.
  const { qrContent, assignedText, itemText, modelText, serialText, orgText } = deriveLabelFields(asset, opts);

  const detailLines: { text: string; bold: boolean }[] = [];
  if (assignedText) detailLines.push({ text: assignedText, bold: true });
  detailLines.push({ text: itemText, bold: true });
  if (modelText) detailLines.push({ text: modelText, bold: true });
  if (serialText) detailLines.push({ text: serialText, bold: true });

  return `<?xml version="1.0" encoding="utf-8"?>
<DesktopLabel Version="1">
  <DYMOLabel Version="4">
    <Description>DYMO Label</Description>
    <Orientation>Landscape</Orientation>
    <LabelName>${LABELMANAGER_TAPE_NAME}</LabelName>
    <InitialLength>${LABELMANAGER_INITIAL_LENGTH_IN}</InitialLength>
    <BorderStyle>SolidLine</BorderStyle>
    <DYMORect>
      <DYMOPoint>
        <X>${LABELMANAGER_LEADER_IN}</X>
        <Y>${LABELMANAGER_TOP_MARGIN_IN}</Y>
      </DYMOPoint>
      <Size>
        <Width>${LABELMANAGER_CONTENT_WIDTH_IN}</Width>
        <Height>${LABELMANAGER_CONTENT_HEIGHT_IN}</Height>
      </Size>
    </DYMORect>
    <BorderColor>${LABELMANAGER_INK_BRUSH}</BorderColor>
    <BorderThickness>1</BorderThickness>
    <Show_Border>True</Show_Border>
    <HasFixedLength>True</HasFixedLength>
    <FixedLengthValue>${LABELMANAGER_FIXED_LENGTH_IN}</FixedLengthValue>
    <GrowingDynamicLayoutManager>
      <RotationBehavior>ClearObjects</RotationBehavior>
      <LabelObjects>
        <QRCodeObject>
          <Name>QRCode</Name>
          <Brushes>
            <BackgroundBrush>${LABELMANAGER_TRANSPARENT_BRUSH}</BackgroundBrush>
            <BorderBrush>${LABELMANAGER_INK_BRUSH}</BorderBrush>
            <StrokeBrush>${LABELMANAGER_INK_BRUSH}</StrokeBrush>
            <FillBrush>${LABELMANAGER_INK_BRUSH}</FillBrush>
          </Brushes>
          <Rotation>Rotation0</Rotation>
          <OutlineThickness>1</OutlineThickness>
          <IsOutlined>False</IsOutlined>
          <BorderStyle>SolidLine</BorderStyle>
          <Margin><DYMOThickness Left="0" Top="0" Right="0" Bottom="0" /></Margin>
          <BarcodeFormat>QRCode</BarcodeFormat>
          <Data><DataString>${escapeXml(qrContent)}</DataString></Data>
          <HorizontalAlignment>Center</HorizontalAlignment>
          <VerticalAlignment>Middle</VerticalAlignment>
          <Size>Large</Size>
          <EQRCodeType>QRCodeText</EQRCodeType>
          <TextDataHolder><Value>${escapeXml(qrContent)}</Value></TextDataHolder>
          <ObjectLayout>
            <DYMOPoint>
              <X>${LABELMANAGER_QR_X_IN}</X>
              <Y>${LABELMANAGER_QR_Y_IN}</Y>
            </DYMOPoint>
            <Size>
              <Width>${LABELMANAGER_QR_WIDTH_IN}</Width>
              <Height>${LABELMANAGER_QR_HEIGHT_IN}</Height>
            </Size>
          </ObjectLayout>
        </QRCodeObject>
        ${orgText ? `<TextObject>
          <Name>TextObject1</Name>
          <Brushes>
            <BackgroundBrush>${LABELMANAGER_TRANSPARENT_BRUSH}</BackgroundBrush>
            <BorderBrush>${LABELMANAGER_INK_BRUSH}</BorderBrush>
            <StrokeBrush>${LABELMANAGER_INK_BRUSH}</StrokeBrush>
            <FillBrush>${LABELMANAGER_INK_BRUSH}</FillBrush>
          </Brushes>
          <Rotation>Rotation0</Rotation>
          <OutlineThickness>1</OutlineThickness>
          <IsOutlined>False</IsOutlined>
          <BorderStyle>SolidLine</BorderStyle>
          <Margin><DYMOThickness Left="0" Top="0" Right="0" Bottom="0" /></Margin>
          <HorizontalAlignment>Center</HorizontalAlignment>
          <VerticalAlignment>Top</VerticalAlignment>
          <FitMode>AlwaysFit</FitMode>
          <IsVertical>False</IsVertical>
          <FormattedText>
            <FitMode>AlwaysFit</FitMode>
            <HorizontalAlignment>Center</HorizontalAlignment>
            <VerticalAlignment>Top</VerticalAlignment>
            <IsVertical>False</IsVertical>
            <LineTextSpan>
              <TextSpan>
                <Text>${orgText}</Text>
                <FontInfo>
                  <FontName>Arial</FontName>
                  <FontSize>7.7</FontSize>
                  <IsBold>True</IsBold>
                  <IsItalic>False</IsItalic>
                  <IsUnderline>False</IsUnderline>
                  <FontBrush>${LABELMANAGER_INK_BRUSH}</FontBrush>
                </FontInfo>
              </TextSpan>
            </LineTextSpan>
          </FormattedText>
          <ObjectLayout>
            <DYMOPoint>
              <X>${LABELMANAGER_ORG_X_IN}</X>
              <Y>${LABELMANAGER_ORG_Y_IN}</Y>
            </DYMOPoint>
            <Size>
              <Width>${LABELMANAGER_ORG_WIDTH_IN}</Width>
              <Height>${LABELMANAGER_ORG_HEIGHT_IN}</Height>
            </Size>
          </ObjectLayout>
        </TextObject>
        ${buildDividerLine('LineObject0', 'Horizontal', LABELMANAGER_HDIVIDER_X_IN, LABELMANAGER_HDIVIDER_Y_IN, LABELMANAGER_HDIVIDER_WIDTH_IN, LABELMANAGER_HDIVIDER_HEIGHT_IN)}` : ''}
        ${buildDividerLine('LineObject1', 'Vertical', LABELMANAGER_VDIVIDER_X_IN, LABELMANAGER_VDIVIDER_Y_IN, LABELMANAGER_VDIVIDER_WIDTH_IN, LABELMANAGER_VDIVIDER_HEIGHT_IN)}
        <TextObject>
          <Name>TextObject0</Name>
          <Brushes>
            <BackgroundBrush>${LABELMANAGER_TRANSPARENT_BRUSH}</BackgroundBrush>
            <BorderBrush>${LABELMANAGER_INK_BRUSH}</BorderBrush>
            <StrokeBrush>${LABELMANAGER_INK_BRUSH}</StrokeBrush>
            <FillBrush>${LABELMANAGER_INK_BRUSH}</FillBrush>
          </Brushes>
          <Rotation>Rotation0</Rotation>
          <OutlineThickness>1</OutlineThickness>
          <IsOutlined>False</IsOutlined>
          <BorderStyle>SolidLine</BorderStyle>
          <Margin><DYMOThickness Left="0" Top="0" Right="0" Bottom="0" /></Margin>
          <HorizontalAlignment>Left</HorizontalAlignment>
          <VerticalAlignment>Middle</VerticalAlignment>
          <FitMode>AlwaysFit</FitMode>
          <IsVertical>False</IsVertical>
          <FormattedText>
            <FitMode>AlwaysFit</FitMode>
            <HorizontalAlignment>Left</HorizontalAlignment>
            <VerticalAlignment>Middle</VerticalAlignment>
            <IsVertical>False</IsVertical>
            ${detailLines.map(line => `<LineTextSpan>
              <TextSpan>
                <Text>${line.text}</Text>
                <FontInfo>
                  <FontName>Arial</FontName>
                  <FontSize>7.9</FontSize>
                  <IsBold>${line.bold ? 'True' : 'False'}</IsBold>
                  <IsItalic>False</IsItalic>
                  <IsUnderline>False</IsUnderline>
                  <FontBrush>${LABELMANAGER_INK_BRUSH}</FontBrush>
                </FontInfo>
              </TextSpan>
            </LineTextSpan>`).join('\n            ')}
          </FormattedText>
          <ObjectLayout>
            <DYMOPoint>
              <X>${LABELMANAGER_DETAILS_X_IN}</X>
              <Y>${LABELMANAGER_DETAILS_Y_IN}</Y>
            </DYMOPoint>
            <Size>
              <Width>${LABELMANAGER_DETAILS_WIDTH_IN}</Width>
              <Height>${LABELMANAGER_DETAILS_HEIGHT_IN}</Height>
            </Size>
          </ObjectLayout>
        </TextObject>
      </LabelObjects>
    </GrowingDynamicLayoutManager>
  </DYMOLabel>
  <LabelApplication>Blank</LabelApplication>
  <DataTable>
    <Columns></Columns>
    <Rows></Rows>
  </DataTable>
</DesktopLabel>`;
}

// The Dymo 1933081 "Bordered" option uses this same DesktopLabel/DYMOLabel/
// DynamicLayoutManager schema, not the twips DieCutLabel schema buildAddressStyleLabelXml
// uses above - DYMO Connect's DieCutLabel renderer does not actually draw a
// RectangleObject/LineObject as visible ink (confirmed by a real print: the label came
// out with no border at all). The constants below were read directly off a "1933081
// Drbl 1 x 3-1/2 in" label exported from DYMO Connect Desktop with a manually-added
// border - same QR+vertical-divider+details layout with a horizontal divider above a
// full-width Organization Name row as the LabelManager tape above and the Brother
// DK-22211 (Bordered) label. Unlike the tape, this uses DynamicLayoutManager (not
// GrowingDynamicLayoutManager/HasFixedLength) since the 1933081 is a fixed-size die-cut
// label, not a continuous tape roll that needs to grow to fit content.
const BORDERED1933081_LABEL_NAME = '1933081 Drbl 1 x 3-1/2 in';

const BORDERED1933081_BORDER_X_IN = 0.22916667;
const BORDERED1933081_BORDER_Y_IN = 0.05;
const BORDERED1933081_BORDER_WIDTH_IN = 3.2083333;
const BORDERED1933081_BORDER_HEIGHT_IN = 0.9;

const BORDERED1933081_QR_X_IN = 0.22916667;
const BORDERED1933081_QR_Y_IN = 0.05000006;
const BORDERED1933081_QR_WIDTH_IN = 0.6725561;
const BORDERED1933081_QR_HEIGHT_IN = 0.71111095;

const BORDERED1933081_VDIVIDER_X_IN = 0.84391016;
const BORDERED1933081_VDIVIDER_Y_IN = 0.057560734;
const BORDERED1933081_VDIVIDER_WIDTH_IN = 0.10000005;
const BORDERED1933081_VDIVIDER_HEIGHT_IN = 0.7035502;

const BORDERED1933081_DETAILS_X_IN = 0.96936655;
const BORDERED1933081_DETAILS_Y_IN = 0.057560734;
const BORDERED1933081_DETAILS_WIDTH_IN = 2.4637587;
const BORDERED1933081_DETAILS_HEIGHT_IN = 0.6966938;

const BORDERED1933081_HDIVIDER_X_IN = 0.22916682;
const BORDERED1933081_HDIVIDER_Y_IN = 0.711111;
const BORDERED1933081_HDIVIDER_WIDTH_IN = 3.1783333;
const BORDERED1933081_HDIVIDER_HEIGHT_IN = 0.1;

const BORDERED1933081_ORG_X_IN = 0.22916667;
const BORDERED1933081_ORG_Y_IN = 0.761111;
const BORDERED1933081_ORG_WIDTH_IN = 3.1783333;
const BORDERED1933081_ORG_HEIGHT_IN = 0.1611729;

/**
 * Build the bordered variant of the Dymo 1933081 label XML, printed the same way as
 * buildDymoLabelXml above (DYMO Connect's local web service, LabelWriter printer
 * family) but using the DesktopLabel/DynamicLayoutManager schema instead of the twips
 * DieCutLabel schema, since only that schema actually renders a visible border.
 */
export async function buildDymoLabelXmlBordered(asset: LabelAsset, settings: Partial<LabelSettings> = {}): Promise<string> {
  const opts = { ...DEFAULT_SETTINGS, ...settings };
  const { qrContent, assignedText, itemText, modelText, serialText, hostIpText, orgText } = deriveLabelFields(asset, opts);

  const detailLines: { text: string; bold: boolean }[] = [];
  if (assignedText) detailLines.push({ text: assignedText, bold: true });
  detailLines.push({ text: itemText, bold: true });
  if (modelText) detailLines.push({ text: modelText, bold: true });
  if (serialText) detailLines.push({ text: serialText, bold: true });
  if (hostIpText) detailLines.push({ text: hostIpText, bold: true });

  return `<?xml version="1.0" encoding="utf-8"?>
<DesktopLabel Version="1">
  <DYMOLabel Version="4">
    <Description>DYMO Label</Description>
    <Orientation>Landscape</Orientation>
    <LabelName>${BORDERED1933081_LABEL_NAME}</LabelName>
    <InitialLength>0</InitialLength>
    <BorderStyle>SolidLine</BorderStyle>
    <DYMORect>
      <DYMOPoint>
        <X>${BORDERED1933081_BORDER_X_IN}</X>
        <Y>${BORDERED1933081_BORDER_Y_IN}</Y>
      </DYMOPoint>
      <Size>
        <Width>${BORDERED1933081_BORDER_WIDTH_IN}</Width>
        <Height>${BORDERED1933081_BORDER_HEIGHT_IN}</Height>
      </Size>
    </DYMORect>
    <BorderColor>${LABELMANAGER_INK_BRUSH}</BorderColor>
    <BorderThickness>1</BorderThickness>
    <Show_Border>True</Show_Border>
    <HasFixedLength>False</HasFixedLength>
    <FixedLengthValue>0</FixedLengthValue>
    <DynamicLayoutManager>
      <RotationBehavior>ClearObjects</RotationBehavior>
      <LabelObjects>
        <QRCodeObject>
          <Name>QRCode</Name>
          <Brushes>
            <BackgroundBrush>${LABELMANAGER_TRANSPARENT_BRUSH}</BackgroundBrush>
            <BorderBrush>${LABELMANAGER_INK_BRUSH}</BorderBrush>
            <StrokeBrush>${LABELMANAGER_INK_BRUSH}</StrokeBrush>
            <FillBrush>${LABELMANAGER_INK_BRUSH}</FillBrush>
          </Brushes>
          <Rotation>Rotation0</Rotation>
          <OutlineThickness>1</OutlineThickness>
          <IsOutlined>False</IsOutlined>
          <BorderStyle>SolidLine</BorderStyle>
          <Margin><DYMOThickness Left="0" Top="0" Right="0" Bottom="0" /></Margin>
          <BarcodeFormat>QRCode</BarcodeFormat>
          <Data><DataString>${escapeXml(qrContent)}</DataString></Data>
          <HorizontalAlignment>Center</HorizontalAlignment>
          <VerticalAlignment>Middle</VerticalAlignment>
          <Size>Large</Size>
          <EQRCodeType>QRCodeText</EQRCodeType>
          <TextDataHolder><Value>${escapeXml(qrContent)}</Value></TextDataHolder>
          <ObjectLayout>
            <DYMOPoint>
              <X>${BORDERED1933081_QR_X_IN}</X>
              <Y>${BORDERED1933081_QR_Y_IN}</Y>
            </DYMOPoint>
            <Size>
              <Width>${BORDERED1933081_QR_WIDTH_IN}</Width>
              <Height>${BORDERED1933081_QR_HEIGHT_IN}</Height>
            </Size>
          </ObjectLayout>
        </QRCodeObject>
        ${buildDividerLine('LineObject1', 'Vertical', BORDERED1933081_VDIVIDER_X_IN, BORDERED1933081_VDIVIDER_Y_IN, BORDERED1933081_VDIVIDER_WIDTH_IN, BORDERED1933081_VDIVIDER_HEIGHT_IN)}
        <TextObject>
          <Name>TextObject1</Name>
          <Brushes>
            <BackgroundBrush>${LABELMANAGER_TRANSPARENT_BRUSH}</BackgroundBrush>
            <BorderBrush>${LABELMANAGER_INK_BRUSH}</BorderBrush>
            <StrokeBrush>${LABELMANAGER_INK_BRUSH}</StrokeBrush>
            <FillBrush>${LABELMANAGER_INK_BRUSH}</FillBrush>
          </Brushes>
          <Rotation>Rotation0</Rotation>
          <OutlineThickness>1</OutlineThickness>
          <IsOutlined>False</IsOutlined>
          <BorderStyle>SolidLine</BorderStyle>
          <Margin><DYMOThickness Left="0" Top="0" Right="0" Bottom="0" /></Margin>
          <HorizontalAlignment>Center</HorizontalAlignment>
          <VerticalAlignment>Middle</VerticalAlignment>
          <FitMode>AlwaysFit</FitMode>
          <IsVertical>False</IsVertical>
          <FormattedText>
            <FitMode>AlwaysFit</FitMode>
            <HorizontalAlignment>Center</HorizontalAlignment>
            <VerticalAlignment>Middle</VerticalAlignment>
            <IsVertical>False</IsVertical>
            ${detailLines.map(line => `<LineTextSpan>
              <TextSpan>
                <Text>${line.text}</Text>
                <FontInfo>
                  <FontName>Arial</FontName>
                  <FontSize>9.1</FontSize>
                  <IsBold>${line.bold ? 'True' : 'False'}</IsBold>
                  <IsItalic>False</IsItalic>
                  <IsUnderline>False</IsUnderline>
                  <FontBrush>${LABELMANAGER_INK_BRUSH}</FontBrush>
                </FontInfo>
              </TextSpan>
            </LineTextSpan>`).join('\n            ')}
          </FormattedText>
          <ObjectLayout>
            <DYMOPoint>
              <X>${BORDERED1933081_DETAILS_X_IN}</X>
              <Y>${BORDERED1933081_DETAILS_Y_IN}</Y>
            </DYMOPoint>
            <Size>
              <Width>${BORDERED1933081_DETAILS_WIDTH_IN}</Width>
              <Height>${BORDERED1933081_DETAILS_HEIGHT_IN}</Height>
            </Size>
          </ObjectLayout>
        </TextObject>
        ${orgText ? `${buildDividerLine('LineObject0', 'Horizontal', BORDERED1933081_HDIVIDER_X_IN, BORDERED1933081_HDIVIDER_Y_IN, BORDERED1933081_HDIVIDER_WIDTH_IN, BORDERED1933081_HDIVIDER_HEIGHT_IN)}
        <TextObject>
          <Name>TextObject2</Name>
          <Brushes>
            <BackgroundBrush>${LABELMANAGER_TRANSPARENT_BRUSH}</BackgroundBrush>
            <BorderBrush>${LABELMANAGER_INK_BRUSH}</BorderBrush>
            <StrokeBrush>${LABELMANAGER_INK_BRUSH}</StrokeBrush>
            <FillBrush>${LABELMANAGER_INK_BRUSH}</FillBrush>
          </Brushes>
          <Rotation>Rotation0</Rotation>
          <OutlineThickness>1</OutlineThickness>
          <IsOutlined>False</IsOutlined>
          <BorderStyle>SolidLine</BorderStyle>
          <Margin><DYMOThickness Left="0" Top="0" Right="0" Bottom="0" /></Margin>
          <HorizontalAlignment>Center</HorizontalAlignment>
          <VerticalAlignment>Middle</VerticalAlignment>
          <FitMode>AlwaysFit</FitMode>
          <IsVertical>False</IsVertical>
          <FormattedText>
            <FitMode>AlwaysFit</FitMode>
            <HorizontalAlignment>Center</HorizontalAlignment>
            <VerticalAlignment>Middle</VerticalAlignment>
            <IsVertical>False</IsVertical>
            <LineTextSpan>
              <TextSpan>
                <Text>${orgText}</Text>
                <FontInfo>
                  <FontName>Arial</FontName>
                  <FontSize>8.6</FontSize>
                  <IsBold>True</IsBold>
                  <IsItalic>False</IsItalic>
                  <IsUnderline>False</IsUnderline>
                  <FontBrush>${LABELMANAGER_INK_BRUSH}</FontBrush>
                </FontInfo>
              </TextSpan>
            </LineTextSpan>
          </FormattedText>
          <ObjectLayout>
            <DYMOPoint>
              <X>${BORDERED1933081_ORG_X_IN}</X>
              <Y>${BORDERED1933081_ORG_Y_IN}</Y>
            </DYMOPoint>
            <Size>
              <Width>${BORDERED1933081_ORG_WIDTH_IN}</Width>
              <Height>${BORDERED1933081_ORG_HEIGHT_IN}</Height>
            </Size>
          </ObjectLayout>
        </TextObject>` : ''}
      </LabelObjects>
    </DynamicLayoutManager>
  </DYMOLabel>
  <LabelApplication>Blank</LabelApplication>
  <DataTable>
    <Columns></Columns>
    <Rows></Rows>
  </DataTable>
</DesktopLabel>`;
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
