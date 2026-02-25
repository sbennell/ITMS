import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from './auth.js';
import {
  createLabelPDF as createBrotherPDF,
  createLabelPreview as createBrotherPreview,
  printLabel as printBrother,
  getAvailablePrinters,
  parseSettings,
  settingsToKeyValue,
  LabelAsset,
  LabelSettings,
} from '../services/labelService.js';
import {
  createLabelPDF as createDymoPDF,
  createLabelPreview as createDymoPreview,
  printLabel as printDymo,
} from '../services/labelService-dymo.js';

const router = Router();

// Get label preview as PNG image
router.get('/preview/:assetId', requireAuth, async (req: Request, res: Response) => {
  try {
    const prisma = req.app.locals.prisma as PrismaClient;
    const assetId = req.params.assetId as string;

    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: { manufacturer: true, ipAddresses: true },
    });

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Get label settings
    const settingsRecords = await prisma.settings.findMany({
      where: {
        key: { in: ['label.labelType', 'label.showAssignedTo', 'label.showHostname', 'label.showIpAddress', 'label.qrCodeContent'] },
      },
    });
    const settingsMap: Record<string, string> = {};
    settingsRecords.forEach((s: { key: string; value: string }) => {
      settingsMap[s.key] = s.value;
    });
    const settings = parseSettings(settingsMap);

    // Resolve first IP (all IPs are equal now)
    const primaryIP = asset.ipAddresses?.[0]?.ip;

    // Select correct preview function based on label type
    const createLabelPreview = settings.labelType === 'dymo-1933081' ? createDymoPreview : createBrotherPreview;
    const previewBuffer = await createLabelPreview({ ...asset, ipAddress: primaryIP } as LabelAsset, settings);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="label-${asset.itemNumber}.png"`);
    res.send(previewBuffer);
  } catch (error) {
    console.error('Label preview error:', error);
    res.status(500).json({ error: 'Failed to generate label preview' });
  }
});

// Print single asset label
router.post('/print/:assetId', requireAuth, async (req: Request, res: Response) => {
  try {
    const prisma = req.app.locals.prisma as PrismaClient;
    const assetId = req.params.assetId as string;
    const { copies = 1, showAssignedTo, showHostname, showIpAddress, qrCodeContent } = req.body;

    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: { manufacturer: true, ipAddresses: true },
    });

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Get label settings and organization name
    const settingsRecords = await prisma.settings.findMany({
      where: {
        key: { in: ['label.labelType', 'label.printerName', 'label.showAssignedTo', 'label.showHostname', 'label.showIpAddress', 'label.qrCodeContent', 'organization'] },
      },
    });
    const settingsMap: Record<string, string> = {};
    settingsRecords.forEach((s: { key: string; value: string }) => {
      settingsMap[s.key] = s.value;
    });
    const settings = parseSettings(settingsMap);
    const organizationName = settingsMap['organization'] || null;

    // Override settings from request body if provided
    const finalSettings = {
      ...settings,
      ...(showAssignedTo !== undefined && { showAssignedTo }),
      ...(showHostname !== undefined && { showHostname }),
      ...(showIpAddress !== undefined && { showIpAddress }),
      ...(qrCodeContent !== undefined && { qrCodeContent }),
    };

    // Select correct service based on label type
    const isDymo = finalSettings.labelType === 'dymo-1933081';
    const createLabelPDF = isDymo ? createDymoPDF : createBrotherPDF;
    const printLabel = isDymo ? printDymo : printBrother;
    const printBrotherLabel = printBrother;
    const printDymoLabel = printDymo;

    // Resolve first IP (all IPs are equal now)
    const primaryIP = asset.ipAddresses?.[0]?.ip;

    // Generate and print label
    const labelAsset: LabelAsset = { ...asset, ipAddress: primaryIP, organizationName };

    if (isDymo) {
      // Dymo: Print directly via WebService (no PDF needed)
      for (let i = 0; i < copies; i++) {
        await printDymoLabel(labelAsset, finalSettings, settings.printerName, 1);
      }
    } else {
      // Brother: Generate PDF and print
      const pdfBytes = await createLabelPDF(labelAsset, finalSettings);
      for (let i = 0; i < copies; i++) {
        await printBrotherLabel(pdfBytes, settings.printerName);
      }
    }

    res.json({
      success: true,
      message: `Printed ${copies} label(s) for ${asset.itemNumber}`,
    });
  } catch (error) {
    console.error('Label print error:', error);
    res.status(500).json({
      error: 'Failed to print label',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Print batch of labels
router.post('/print-batch', requireAuth, async (req: Request, res: Response) => {
  try {
    const prisma = req.app.locals.prisma as PrismaClient;
    const { assetIds, copies = 1, showAssignedTo, showHostname, showIpAddress, qrCodeContent } = req.body;

    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return res.status(400).json({ error: 'assetIds array is required' });
    }

    // Get label settings and organization name
    const settingsRecords = await prisma.settings.findMany({
      where: {
        key: { in: ['label.labelType', 'label.printerName', 'label.showAssignedTo', 'label.showHostname', 'label.showIpAddress', 'label.qrCodeContent', 'organization'] },
      },
    });
    const settingsMap: Record<string, string> = {};
    settingsRecords.forEach((s: { key: string; value: string }) => {
      settingsMap[s.key] = s.value;
    });
    const settings = parseSettings(settingsMap);
    const organizationName = settingsMap['organization'] || null;

    // Override settings from request body if provided
    const finalSettings = {
      ...settings,
      ...(showAssignedTo !== undefined && { showAssignedTo }),
      ...(showHostname !== undefined && { showHostname }),
      ...(showIpAddress !== undefined && { showIpAddress }),
      ...(qrCodeContent !== undefined && { qrCodeContent }),
    };

    // Select correct service based on label type
    const isDymo = finalSettings.labelType === 'dymo-1933081';
    const createLabelPDF = isDymo ? createDymoPDF : createBrotherPDF;
    const printBrotherLabel = printBrother;
    const printDymoLabel = printDymo;

    // Fetch all assets
    const assets = await prisma.asset.findMany({
      where: { id: { in: assetIds } },
      include: { manufacturer: true, ipAddresses: true },
    });

    let printed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const asset of assets) {
      try {
        // Resolve first IP (all IPs are equal now)
        const primaryIP = asset.ipAddresses?.[0]?.ip;

        const labelAsset: LabelAsset = { ...asset, ipAddress: primaryIP, organizationName };

        if (isDymo) {
          // Dymo: Print directly via WebService
          for (let i = 0; i < copies; i++) {
            await printDymoLabel(labelAsset, finalSettings, settings.printerName, 1);
          }
        } else {
          // Brother: Generate PDF and print
          const pdfBytes = await createLabelPDF(labelAsset, finalSettings);
          for (let i = 0; i < copies; i++) {
            await printBrotherLabel(pdfBytes, settings.printerName);
          }
        }
        printed++;
      } catch (error) {
        failed++;
        errors.push(`${asset.itemNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Check for assets not found
    const foundIds = assets.map(a => a.id);
    const notFoundIds = assetIds.filter((id: string) => !foundIds.includes(id));
    if (notFoundIds.length > 0) {
      failed += notFoundIds.length;
      errors.push(`Assets not found: ${notFoundIds.length}`);
    }

    res.json({
      success: failed === 0,
      printed,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Batch print error:', error);
    res.status(500).json({ error: 'Failed to print labels' });
  }
});

// Download batch of labels as combined PDF
router.get('/download-batch', requireAuth, async (req: Request, res: Response) => {
  try {
    const prisma = req.app.locals.prisma as PrismaClient;
    const assetIdsParam = req.query.assetIds as string;

    if (!assetIdsParam) {
      return res.status(400).json({ error: 'assetIds parameter is required' });
    }

    const assetIds = assetIdsParam.split(',');

    // Get optional query params for settings override
    const showAssignedTo = req.query.showAssignedTo !== undefined ? req.query.showAssignedTo === 'true' : undefined;
    const showHostname = req.query.showHostname !== undefined ? req.query.showHostname === 'true' : undefined;
    const showIpAddress = req.query.showIpAddress !== undefined ? req.query.showIpAddress === 'true' : undefined;
    const qrCodeContent = req.query.qrCodeContent as 'full' | 'itemNumber' | undefined;

    // Get label settings and organization name
    const settingsRecords = await prisma.settings.findMany({
      where: {
        key: { in: ['label.labelType', 'label.printerName', 'label.showAssignedTo', 'label.showHostname', 'label.showIpAddress', 'label.qrCodeContent', 'organization'] },
      },
    });
    const settingsMap: Record<string, string> = {};
    settingsRecords.forEach((s: { key: string; value: string }) => {
      settingsMap[s.key] = s.value;
    });
    const settings = parseSettings(settingsMap);
    const organizationName = settingsMap['organization'] || null;

    // Override settings from query params if provided
    const finalSettings = {
      ...settings,
      ...(showAssignedTo !== undefined && { showAssignedTo }),
      ...(showHostname !== undefined && { showHostname }),
      ...(showIpAddress !== undefined && { showIpAddress }),
      ...(qrCodeContent !== undefined && { qrCodeContent }),
    };

    // Select correct service based on label type
    const isDymo = finalSettings.labelType === 'dymo-1933081';
    const createLabelPDF = isDymo ? createDymoPDF : createBrotherPDF;

    // Fetch all assets
    const assets = await prisma.asset.findMany({
      where: { id: { in: assetIds } },
      include: { manufacturer: true, ipAddresses: true },
    });

    if (assets.length === 0) {
      return res.status(404).json({ error: 'No assets found' });
    }

    // Generate all label PDFs and combine them
    const { PDFDocument } = await import('pdf-lib');
    const combinedPdf = await PDFDocument.create();

    for (const asset of assets) {
      // Resolve first IP (all IPs are equal now)
      const primaryIP = asset.ipAddresses?.[0]?.ip;

      const labelAsset: LabelAsset = { ...asset, ipAddress: primaryIP, organizationName };
      const pdfBytes = await createLabelPDF(labelAsset, finalSettings);
      const labelPdf = await PDFDocument.load(pdfBytes);
      const [page] = await combinedPdf.copyPages(labelPdf, [0]);
      combinedPdf.addPage(page);
    }

    const combinedBytes = await combinedPdf.save();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="labels-batch-${assets.length}.pdf"`);
    res.send(Buffer.from(combinedBytes));
  } catch (error) {
    console.error('Batch download error:', error);
    res.status(500).json({ error: 'Failed to generate batch PDF' });
  }
});

// Get available printers
router.get('/printers', requireAuth, async (_req: Request, res: Response) => {
  try {
    const printers = await getAvailablePrinters();
    res.json(printers);
  } catch (error) {
    console.error('Get printers error:', error);
    res.status(500).json({ error: 'Failed to get printers' });
  }
});

// Get label settings
router.get('/settings', requireAuth, async (req: Request, res: Response) => {
  try {
    const prisma = req.app.locals.prisma as PrismaClient;

    const settingsRecords = await prisma.settings.findMany({
      where: {
        key: { startsWith: 'label.' },
      },
    });

    const settingsMap: Record<string, string> = {};
    settingsRecords.forEach((s: { key: string; value: string }) => {
      settingsMap[s.key] = s.value;
    });

    const settings = parseSettings(settingsMap);
    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get label settings' });
  }
});

// Get available label types
router.get('/label-types', requireAuth, async (_req: Request, res: Response) => {
  try {
    res.json([
      { id: 'brother-dk22211', name: 'Brother DK-22211 (29×62mm)' },
      { id: 'dymo-1933081', name: 'Dymo 1933081 (25×89mm)' },
    ]);
  } catch (error) {
    console.error('Get label types error:', error);
    res.status(500).json({ error: 'Failed to get label types' });
  }
});

// Update label settings
router.put('/settings', requireAuth, async (req: Request, res: Response) => {
  try {
    const prisma = req.app.locals.prisma as PrismaClient;
    const updates = req.body as Partial<LabelSettings>;

    const keyValues = settingsToKeyValue(updates);

    // Upsert each setting
    for (const [key, value] of Object.entries(keyValues)) {
      await prisma.settings.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }

    // Return updated settings
    const settingsRecords = await prisma.settings.findMany({
      where: {
        key: { startsWith: 'label.' },
      },
    });

    const settingsMap: Record<string, string> = {};
    settingsRecords.forEach((s: { key: string; value: string }) => {
      settingsMap[s.key] = s.value;
    });

    const settings = parseSettings(settingsMap);
    res.json(settings);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update label settings' });
  }
});

// Get available printers
router.get('/printers', requireAuth, async (_req: Request, res: Response) => {
  try {
    // Get printers from the appropriate service based on settings
    const { getAvailablePrinters: getBrotherPrinters } = await import('../services/labelService.js');
    const { getAvailablePrinters: getDymoPrinters } = await import('../services/labelService-dymo.js');

    const brotherPrinters = await getBrotherPrinters();
    const dymoPrinters = await getDymoPrinters();
    const allPrinters = [...new Set([...brotherPrinters, ...dymoPrinters])];

    res.json(allPrinters);
  } catch (error) {
    console.error('Get printers error:', error);
    res.status(500).json({ error: 'Failed to get printers' });
  }
});

// Download label as PDF (for manual printing)
router.get('/download/:assetId', requireAuth, async (req: Request, res: Response) => {
  try {
    const prisma = req.app.locals.prisma as PrismaClient;
    const assetId = req.params.assetId as string;

    // Get optional query params for settings override
    const showAssignedTo = req.query.showAssignedTo !== undefined ? req.query.showAssignedTo === 'true' : undefined;
    const showHostname = req.query.showHostname !== undefined ? req.query.showHostname === 'true' : undefined;
    const showIpAddress = req.query.showIpAddress !== undefined ? req.query.showIpAddress === 'true' : undefined;
    const qrCodeContent = req.query.qrCodeContent as 'full' | 'itemNumber' | undefined;

    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: { manufacturer: true, ipAddresses: true },
    });

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Get label settings and organization name
    const settingsRecords = await prisma.settings.findMany({
      where: {
        key: { in: ['label.labelType', 'label.printerName', 'label.showAssignedTo', 'label.showHostname', 'label.showIpAddress', 'label.qrCodeContent', 'organization'] },
      },
    });
    const settingsMap: Record<string, string> = {};
    settingsRecords.forEach((s: { key: string; value: string }) => {
      settingsMap[s.key] = s.value;
    });
    const settings = parseSettings(settingsMap);
    const organizationName = settingsMap['organization'] || null;

    // Override settings from query params if provided
    const finalSettings = {
      ...settings,
      ...(showAssignedTo !== undefined && { showAssignedTo }),
      ...(showHostname !== undefined && { showHostname }),
      ...(showIpAddress !== undefined && { showIpAddress }),
      ...(qrCodeContent !== undefined && { qrCodeContent }),
    };

    // Select correct service based on label type
    const isDymo = finalSettings.labelType === 'dymo-1933081';
    const createLabelPDF = isDymo ? createDymoPDF : createBrotherPDF;

    // Resolve first IP (all IPs are equal now)
    const primaryIP = asset.ipAddresses?.[0]?.ip;

    const labelAsset: LabelAsset = { ...asset, ipAddress: primaryIP, organizationName };
    const pdfBytes = await createLabelPDF(labelAsset, finalSettings);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="label-${asset.itemNumber}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Label download error:', error);
    res.status(500).json({ error: 'Failed to generate label PDF' });
  }
});

// Debug endpoint for testing DYMO API with different parameter formats
router.post('/debug/test-print', requireAuth, async (req: Request, res: Response) => {
  try {
    const { printerName } = req.body;

    if (!printerName) {
      return res.status(400).json({ error: 'printerName is required' });
    }

    const https = await import('https');

    // Test with minimal XML
    const minimalXml = `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Address</Id>
  <PaperName>30252 Address</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="5040" Height="1440" Rx="270" Ry="270" />
  </DrawCommands>
  <ObjectInfo>
    <TextObject>
      <Name>TestText</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>TEST LABEL</String>
          <Attributes>
            <Font Family="Arial" Size="12" Bold="True" Italic="False" Underline="False" Strikeout="False" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="100" Y="400" Width="4800" Height="600" />
  </ObjectInfo>
</DieCutLabel>`;

    const printParamsXml = `<LabelWriterPrintParams>
      <Copies>1</Copies>
      <JobTitle>Test</JobTitle>
      <FlowDirection>LeftToRight</FlowDirection>
      <PrintQuality>Text</PrintQuality>
    </LabelWriterPrintParams>`;

    // Test different parameter name combinations
    const tests = [
      { name: 'lowercase', params: new URLSearchParams({ printerName, labelXml: minimalXml, printParamsXml }) },
      { name: 'PascalCase', params: new URLSearchParams({ PrinterName: printerName, LabelXml: minimalXml, PrintParamsXml: printParamsXml }) },
      { name: 'snake_case', params: new URLSearchParams({ printer_name: printerName, label_xml: minimalXml, print_params_xml: printParamsXml }) },
    ];

    const results: any[] = [];

    for (const test of tests) {
      const body = test.params;
      const cleanedName = printerName.startsWith('\\\\')
        ? printerName.split('\\').pop() || printerName
        : printerName;

      try {
        await new Promise((resolve, reject) => {
          const agent = new https.Agent({ rejectUnauthorized: false });
          const options = {
            hostname: '127.0.0.1',
            port: 41951,
            path: '/DYMO/DLS/Printing/PrintLabel',
            method: 'POST',
            agent: agent,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(body.toString()),
            },
          };

          const req = https.request(options, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                resolve(null);
              } else {
                reject(new Error(`${res.statusCode}: ${data}`));
              }
            });
          });

          req.on('error', reject);
          req.write(body.toString());
          req.end();
        });

        results.push({ test: test.name, status: 'success', message: 'Printed successfully' });
      } catch (error: any) {
        results.push({ test: test.name, status: 'failed', message: error.message });
      }
    }

    res.json({
      printerName: printerName,
      cleanedName: printerName.startsWith('\\\\') ? printerName.split('\\').pop() : printerName,
      results,
    });
  } catch (error) {
    console.error('Debug test error:', error);
    res.status(500).json({ error: 'Failed to run debug test', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
