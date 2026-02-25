import bwipjs from 'bwip-js';
import { request } from 'http';
import { URLSearchParams } from 'url';


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
 * Generates a .label file format for 25mm × 89mm (1933081) label
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

  // Build ObjectInfo blocks (each object gets its own ObjectInfo with Bounds)
  const objectInfos: string[] = [];

  // QR Code (barcode) object
  objectInfos.push(`	<ObjectInfo>
		<BarcodeObject>
			<Name>BARCODE</Name>
			<ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
			<BackColor Alpha="0" Red="255" Green="255" Blue="255" />
			<LinkedObjectName />
			<Rotation>Rotation0</Rotation>
			<IsMirrored>False</IsMirrored>
			<IsVariable>False</IsVariable>
			<GroupID>-1</GroupID>
			<IsOutlined>False</IsOutlined>
			<Text>${escapeXml(qrContent)}</Text>
			<Type>QRCode</Type>
			<Size>Medium</Size>
			<TextPosition>None</TextPosition>
			<TextFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
			<CheckSumFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
			<TextEmbedding>None</TextEmbedding>
			<ECLevel>0</ECLevel>
			<HorizontalAlignment>Center</HorizontalAlignment>
			<QuietZonesPadding Left="0" Top="0" Right="0" Bottom="0" />
		</BarcodeObject>
		<Bounds X="50" Y="150" Width="900" Height="900" />
	</ObjectInfo>`);

  let yPos = 100;

  // Item Number
  objectInfos.push(`	<ObjectInfo>
		<TextObject>
			<Name>ItemNumber</Name>
			<ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
			<BackColor Alpha="0" Red="255" Green="255" Blue="255" />
			<LinkedObjectName />
			<Rotation>Rotation0</Rotation>
			<IsMirrored>False</IsMirrored>
			<IsVariable>False</IsVariable>
			<GroupID>-1</GroupID>
			<IsOutlined>False</IsOutlined>
			<HorizontalAlignment>Left</HorizontalAlignment>
			<VerticalAlignment>Top</VerticalAlignment>
			<TextFitMode>None</TextFitMode>
			<UseFullFontHeight>True</UseFullFontHeight>
			<Verticalized>False</Verticalized>
			<StyledText>
				<Element>
					<String xml:space="preserve">${escapeXml(`Item: ${asset.itemNumber}`)}</String>
					<Attributes>
						<Font Family="Arial" Size="9" Bold="True" Italic="False" Underline="False" Strikeout="False" />
						<ForeColor Alpha="255" Red="0" Green="0" Blue="0" HueScale="100" />
					</Attributes>
				</Element>
			</StyledText>
		</TextObject>
		<Bounds X="1100" Y="${yPos}" Width="4000" Height="180" />
	</ObjectInfo>`);
  yPos += 200;

  // Model
  if (asset.model) {
    const modelText = asset.manufacturer?.name
      ? `${asset.manufacturer.name} ${asset.model}`
      : asset.model;
    objectInfos.push(`	<ObjectInfo>
		<TextObject>
			<Name>Model</Name>
			<ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
			<BackColor Alpha="0" Red="255" Green="255" Blue="255" />
			<LinkedObjectName />
			<Rotation>Rotation0</Rotation>
			<IsMirrored>False</IsMirrored>
			<IsVariable>False</IsVariable>
			<GroupID>-1</GroupID>
			<IsOutlined>False</IsOutlined>
			<HorizontalAlignment>Left</HorizontalAlignment>
			<VerticalAlignment>Top</VerticalAlignment>
			<TextFitMode>None</TextFitMode>
			<UseFullFontHeight>True</UseFullFontHeight>
			<Verticalized>False</Verticalized>
			<StyledText>
				<Element>
					<String xml:space="preserve">${escapeXml(modelText)}</String>
					<Attributes>
						<Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
						<ForeColor Alpha="255" Red="0" Green="0" Blue="0" HueScale="100" />
					</Attributes>
				</Element>
			</StyledText>
		</TextObject>
		<Bounds X="1100" Y="${yPos}" Width="4000" Height="160" />
	</ObjectInfo>`);
    yPos += 180;
  }

  // Serial Number
  if (asset.serialNumber) {
    objectInfos.push(`	<ObjectInfo>
		<TextObject>
			<Name>SerialNumber</Name>
			<ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
			<BackColor Alpha="0" Red="255" Green="255" Blue="255" />
			<LinkedObjectName />
			<Rotation>Rotation0</Rotation>
			<IsMirrored>False</IsMirrored>
			<IsVariable>False</IsVariable>
			<GroupID>-1</GroupID>
			<IsOutlined>False</IsOutlined>
			<HorizontalAlignment>Left</HorizontalAlignment>
			<VerticalAlignment>Top</VerticalAlignment>
			<TextFitMode>None</TextFitMode>
			<UseFullFontHeight>True</UseFullFontHeight>
			<Verticalized>False</Verticalized>
			<StyledText>
				<Element>
					<String xml:space="preserve">${escapeXml(`S/N: ${asset.serialNumber}`)}</String>
					<Attributes>
						<Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
						<ForeColor Alpha="255" Red="0" Green="0" Blue="0" HueScale="100" />
					</Attributes>
				</Element>
			</StyledText>
		</TextObject>
		<Bounds X="1100" Y="${yPos}" Width="4000" Height="160" />
	</ObjectInfo>`);
    yPos += 180;
  }

  // Hostname
  if (opts.showHostname && asset.hostname) {
    objectInfos.push(`	<ObjectInfo>
		<TextObject>
			<Name>Hostname</Name>
			<ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
			<BackColor Alpha="0" Red="255" Green="255" Blue="255" />
			<LinkedObjectName />
			<Rotation>Rotation0</Rotation>
			<IsMirrored>False</IsMirrored>
			<IsVariable>False</IsVariable>
			<GroupID>-1</GroupID>
			<IsOutlined>False</IsOutlined>
			<HorizontalAlignment>Left</HorizontalAlignment>
			<VerticalAlignment>Top</VerticalAlignment>
			<TextFitMode>None</TextFitMode>
			<UseFullFontHeight>True</UseFullFontHeight>
			<Verticalized>False</Verticalized>
			<StyledText>
				<Element>
					<String xml:space="preserve">${escapeXml(asset.hostname)}</String>
					<Attributes>
						<Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
						<ForeColor Alpha="255" Red="0" Green="0" Blue="0" HueScale="100" />
					</Attributes>
				</Element>
			</StyledText>
		</TextObject>
		<Bounds X="1100" Y="${yPos}" Width="4000" Height="160" />
	</ObjectInfo>`);
    yPos += 180;
  }

  // IP Address
  if (opts.showIpAddress && asset.ipAddress) {
    objectInfos.push(`	<ObjectInfo>
		<TextObject>
			<Name>IpAddress</Name>
			<ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
			<BackColor Alpha="0" Red="255" Green="255" Blue="255" />
			<LinkedObjectName />
			<Rotation>Rotation0</Rotation>
			<IsMirrored>False</IsMirrored>
			<IsVariable>False</IsVariable>
			<GroupID>-1</GroupID>
			<IsOutlined>False</IsOutlined>
			<HorizontalAlignment>Left</HorizontalAlignment>
			<VerticalAlignment>Top</VerticalAlignment>
			<TextFitMode>None</TextFitMode>
			<UseFullFontHeight>True</UseFullFontHeight>
			<Verticalized>False</Verticalized>
			<StyledText>
				<Element>
					<String xml:space="preserve">${escapeXml(asset.ipAddress)}</String>
					<Attributes>
						<Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
						<ForeColor Alpha="255" Red="0" Green="0" Blue="0" HueScale="100" />
					</Attributes>
				</Element>
			</StyledText>
		</TextObject>
		<Bounds X="1100" Y="${yPos}" Width="4000" Height="160" />
	</ObjectInfo>`);
    yPos += 180;
  }

  // Assigned To
  if (opts.showAssignedTo && asset.assignedTo) {
    objectInfos.push(`	<ObjectInfo>
		<TextObject>
			<Name>AssignedTo</Name>
			<ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
			<BackColor Alpha="0" Red="255" Green="255" Blue="255" />
			<LinkedObjectName />
			<Rotation>Rotation0</Rotation>
			<IsMirrored>False</IsMirrored>
			<IsVariable>False</IsVariable>
			<GroupID>-1</GroupID>
			<IsOutlined>False</IsOutlined>
			<HorizontalAlignment>Left</HorizontalAlignment>
			<VerticalAlignment>Top</VerticalAlignment>
			<TextFitMode>None</TextFitMode>
			<UseFullFontHeight>True</UseFullFontHeight>
			<Verticalized>False</Verticalized>
			<StyledText>
				<Element>
					<String xml:space="preserve">${escapeXml(asset.assignedTo)}</String>
					<Attributes>
						<Font Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
						<ForeColor Alpha="255" Red="0" Green="0" Blue="0" HueScale="100" />
					</Attributes>
				</Element>
			</StyledText>
		</TextObject>
		<Bounds X="1100" Y="${yPos}" Width="4000" Height="160" />
	</ObjectInfo>`);
  }

  // Organization Name (bottom)
  if (asset.organizationName) {
    objectInfos.push(`	<ObjectInfo>
		<TextObject>
			<Name>Organization</Name>
			<ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
			<BackColor Alpha="0" Red="255" Green="255" Blue="255" />
			<LinkedObjectName />
			<Rotation>Rotation0</Rotation>
			<IsMirrored>False</IsMirrored>
			<IsVariable>False</IsVariable>
			<GroupID>-1</GroupID>
			<IsOutlined>False</IsOutlined>
			<HorizontalAlignment>Center</HorizontalAlignment>
			<VerticalAlignment>Top</VerticalAlignment>
			<TextFitMode>None</TextFitMode>
			<UseFullFontHeight>True</UseFullFontHeight>
			<Verticalized>False</Verticalized>
			<StyledText>
				<Element>
					<String xml:space="preserve">${escapeXml(asset.organizationName)}</String>
					<Attributes>
						<Font Family="Arial" Size="7" Bold="False" Italic="False" Underline="False" Strikeout="False" />
						<ForeColor Alpha="255" Red="0" Green="0" Blue="0" HueScale="100" />
					</Attributes>
				</Element>
			</StyledText>
		</TextObject>
		<Bounds X="50" Y="1150" Width="4990" Height="150" />
	</ObjectInfo>`);
  }

  // Construct complete .label XML with proper DYMO format
  const labelXml = `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips" MediaType="Durable">
	<PaperOrientation>Landscape</PaperOrientation>
	<Id>LW_DURABLE_25X89mm</Id>
	<IsOutlined>false</IsOutlined>
	<PaperName>1933081 Drbl 1 x 3-1/2 in</PaperName>
	<DrawCommands>
		<RoundRectangle X="0" Y="0" Width="1440" Height="5040" Rx="90.708661417" Ry="90.708661417" />
	</DrawCommands>
${objectInfos.join('\n')}
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
 * Print a label to the specified printer using DYMO Label Software web service
 * Sends the label XML to http://127.0.0.1:41951/DYMO/DLS/Printing/PrintLabel
 */
export async function printLabel(
  labelBytes: Uint8Array,
  printerName: string
): Promise<void> {
  const labelXml = Buffer.from(labelBytes).toString('utf-8');
  const printParams = '<LabelWriterPrintParams><Copies>1</Copies></LabelWriterPrintParams>';

  const body = new URLSearchParams({
    printerName,
    labelXmlContent: labelXml,
    printParamsXml: printParams,
    paramsXml: '',
  }).toString();

  console.log('[DYMO] Printing label to printer:', printerName);

  return new Promise<void>((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port: 41951,
        path: '/DYMO/DLS/Printing/PrintLabel',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          console.log(`[DYMO] Response status: ${res.statusCode}`);
          console.log(`[DYMO] Response data: ${responseData.substring(0, 200)}`);
          if (res.statusCode === 200 || res.statusCode === 201) {
            console.log('[DYMO] Label printed successfully');
            resolve();
          } else {
            console.error('[DYMO] Service error:', res.statusCode);
            console.error('[DYMO] Response:', responseData);
            reject(new Error(`DYMO service error: ${res.statusCode} - ${responseData}`));
          }
        });
      }
    );

    req.on('error', (error) => {
      console.error('[DYMO] Failed to connect to DYMO service:', error.message);
      console.error('[DYMO] Make sure DYMO Label Software is running on http://127.0.0.1:41951');
      console.error('[DYMO] Error details:', error);
      reject(error);
    });

    req.on('timeout', () => {
      console.error('[DYMO] Request timeout');
      req.destroy();
      reject(new Error('DYMO service timeout'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Get list of available DYMO printers from the DYMO Label Software web service
 */
export async function getAvailablePrinters(): Promise<string[]> {
  return new Promise<string[]>((resolve) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port: 41951,
        path: '/DYMO/DLS/Printing/GetPrinters',
        method: 'GET',
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            // Parse printer names from XML response: <Name>PrinterName</Name>
            const printerNames: string[] = [];
            const nameRegex = /<Name>([^<]+)<\/Name>/g;
            let match;
            while ((match = nameRegex.exec(data)) !== null) {
              printerNames.push(match[1]);
            }
            console.log('[DYMO] Found printers:', printerNames);
            resolve(printerNames);
          } catch (error) {
            console.error('[DYMO] Failed to parse printers:', error);
            resolve([]);
          }
        });
      }
    );

    req.on('error', (error) => {
      console.warn('[DYMO] Failed to get printers from service:', error.message);
      console.warn('[DYMO] Make sure DYMO Label Software is running');
      resolve([]);
    });

    req.end();
  });
}

