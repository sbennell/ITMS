import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { requireAuth, requirePermission, requireAdmin } from './auth.js';

const router = Router();

// Apply auth to all routes
router.use(requireAuth, requirePermission('canAccessSoftware'));

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const SOFTWARE_UPLOAD_DIR = path.join(UPLOAD_DIR, 'software');

const ALLOWED_ATTACHMENT_TYPES: Record<string, boolean> = {
  'application/pdf': true,
  'application/msword': true,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
  'application/vnd.ms-excel': true,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
  'image/png': true,
  'image/jpeg': true
};
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(SOFTWARE_UPLOAD_DIR, req.params.id as string);
      fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[/\\]/g, '_');
      cb(null, `${randomUUID()}-${safeName}`);
    }
  }),
  limits: { fileSize: MAX_ATTACHMENT_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_TYPES[file.mimetype]) {
      return cb(new Error('Unsupported file type. Allowed: PDF, Word, Excel, PNG, JPEG.'));
    }
    cb(null, true);
  }
});

// Mirrors utils.ts label maps for the export - kept independent of the web package
const CRITICALITY_LABELS: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CROWN_JEWEL: 'Crown Jewel'
};
const DATA_CLASSIFICATION_LABELS: Record<string, string> = {
  PUBLIC: 'Public',
  INTERNAL: 'Internal',
  SENSITIVE: 'Sensitive',
  RESTRICTED: 'Restricted'
};
const HOSTING_LABELS: Record<string, string> = {
  ON_PREM: 'On-Premises',
  SCHOOL_CLOUD: 'School Managed Cloud',
  MACS_CLOUD: 'MACS Managed Cloud',
  THIRD_PARTY_CLOUD: 'Third-Party Managed Cloud',
  DET_HOSTED: 'DET Managed Hosted'
};
const SUPPORT_LABELS: Record<string, string> = {
  IN_HOUSE: 'In-house IT',
  SAAS: 'SaaS',
  VENDOR: 'Vendor Supported'
};

// List software with pagination, filtering, and sorting
router.get('/', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const {
      page = '1',
      limit = '50',
      search,
      status,
      category,
      publisher,
      supplier,
      sortBy = 'itemNumber',
      sortOrder = 'asc'
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.SoftwareWhereInput = {};

    if (search) {
      where.OR = [
        { itemNumber: { contains: search as string } },
        { name: { contains: search as string } },
        { description: { contains: search as string } },
        { version: { contains: search as string } }
      ];
    }

    if (status && status !== '_all') {
      where.status = status as string;
    }

    if (category) {
      where.categoryId = category as string;
    }

    if (publisher) {
      where.publisherId = publisher as string;
    }

    if (supplier) {
      where.supplierId = supplier as string;
    }

    let orderBy: Prisma.SoftwareOrderByWithRelationInput = {
      [sortBy as string]: sortOrder as 'asc' | 'desc'
    };

    if (sortBy === 'publisher') {
      orderBy = { publisher: { name: sortOrder as 'asc' | 'desc' } };
    } else if (sortBy === 'category') {
      orderBy = { category: { name: sortOrder as 'asc' | 'desc' } };
    } else if (sortBy === 'itemNumber') {
      orderBy = { itemNumber: 'asc' }; // Placeholder, re-sorted below for natural numeric order
    }

    const [total, softwareRaw] = await Promise.all([
      prisma.software.count({ where }),
      prisma.software.findMany({
        where,
        orderBy,
        skip: sortBy === 'itemNumber' ? 0 : skip,
        take: sortBy === 'itemNumber' ? undefined : limitNum,
        include: {
          publisher: true,
          category: true,
          supplier: true
        }
      })
    ]);

    let software = softwareRaw;
    if (sortBy === 'itemNumber') {
      software = softwareRaw.sort((a, b) => {
        const numA = parseInt(a.itemNumber.replace(/\D/g, '') || '0', 10);
        const numB = parseInt(b.itemNumber.replace(/\D/g, '') || '0', 10);
        if (numA !== numB) {
          return sortOrder === 'asc' ? numA - numB : numB - numA;
        }
        return sortOrder === 'asc'
          ? a.itemNumber.localeCompare(b.itemNumber)
          : b.itemNumber.localeCompare(a.itemNumber);
      });
      software = software.slice(skip, skip + limitNum);
    }

    res.json({
      data: software,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching software:', error);
    res.status(500).json({ error: 'Failed to fetch software' });
  }
});

// Get next item number (must be before /:id route)
router.get('/next-item-number', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const software = await prisma.software.findMany({
      select: { itemNumber: true }
    });

    let maxNum = 0;
    for (const item of software) {
      const nums = item.itemNumber.match(/\d+/g);
      if (nums) {
        const last = parseInt(nums[nums.length - 1], 10);
        if (last > maxNum) maxNum = last;
      }
    }

    res.json({ nextItemNumber: String(maxNum + 1) });
  } catch (error) {
    console.error('Error getting next software item number:', error);
    res.status(500).json({ error: 'Failed to get next item number' });
  }
});

// Export software register to Excel (admin only)
router.get('/export', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const software = await prisma.software.findMany({
      include: {
        publisher: true,
        category: true,
        supplier: true
      },
      orderBy: { itemNumber: 'asc' }
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IT Management System (ITMS)';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Software');
    worksheet.columns = [
      { header: 'Item Number', key: 'itemNumber', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Publisher', key: 'publisher', width: 20 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Version', key: 'version', width: 14 },
      { header: 'URL', key: 'url', width: 25 },
      { header: 'App Store', key: 'appStore', width: 20 },
      { header: 'Deployment Mechanism', key: 'deploymentMechanism', width: 20 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Business Purpose', key: 'businessPurpose', width: 30 },
      { header: 'Business Owner', key: 'businessOwner', width: 20 },
      { header: 'Technical Owner', key: 'technicalOwner', width: 20 },
      { header: 'Initial Install Date', key: 'initialInstallDate', width: 18 },
      { header: 'License Expiration', key: 'licenseExpiration', width: 18 },
      { header: 'License Count', key: 'licenseCount', width: 14 },
      { header: 'Supplier', key: 'supplier', width: 20 },
      { header: 'Last Review Date', key: 'lastReviewDate', width: 16 },
      { header: 'Decommission Date', key: 'decommissionDate', width: 18 },
      { header: 'Criticality', key: 'criticalityTier', width: 14 },
      { header: 'Data Classification', key: 'dataClassification', width: 16 },
      { header: 'Hosting', key: 'hostingType', width: 20 },
      { header: 'Support Type', key: 'supportType', width: 16 },
      { header: 'Internet Facing', key: 'internetFacing', width: 14 },
      { header: 'Comments', key: 'comments', width: 30 }
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 20;

    for (const item of software) {
      worksheet.addRow({
        itemNumber: item.itemNumber,
        name: item.name,
        publisher: item.publisher?.name,
        category: item.category?.name,
        description: item.description,
        version: item.version,
        url: item.url,
        appStore: item.appStore,
        deploymentMechanism: item.deploymentMechanism,
        status: item.status,
        businessPurpose: item.businessPurpose,
        businessOwner: item.businessOwner,
        technicalOwner: item.technicalOwner,
        initialInstallDate: item.initialInstallDate,
        licenseExpiration: item.licenseExpiration,
        licenseCount: item.licenseCount,
        supplier: item.supplier?.name,
        lastReviewDate: item.lastReviewDate,
        decommissionDate: item.decommissionDate,
        criticalityTier: item.criticalityTier ? (CRITICALITY_LABELS[item.criticalityTier] ?? item.criticalityTier) : null,
        dataClassification: item.dataClassification ? (DATA_CLASSIFICATION_LABELS[item.dataClassification] ?? item.dataClassification) : null,
        hostingType: item.hostingType ? (HOSTING_LABELS[item.hostingType] ?? item.hostingType) : null,
        supportType: item.supportType ? (SUPPORT_LABELS[item.supportType] ?? item.supportType) : null,
        internetFacing: item.internetFacing === null ? null : (item.internetFacing ? 'Yes' : 'No'),
        comments: item.comments
      });
    }

    worksheet.getColumn('initialInstallDate').numFmt = 'yyyy-mm-dd';
    worksheet.getColumn('licenseExpiration').numFmt = 'yyyy-mm-dd';
    worksheet.getColumn('lastReviewDate').numFmt = 'yyyy-mm-dd';
    worksheet.getColumn('decommissionDate').numFmt = 'yyyy-mm-dd';

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `software-export-${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Software export error:', error);
    res.status(500).json({ error: 'Failed to export software' });
  }
});

// Get single software item
router.get('/:id', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    const software = await prisma.software.findUnique({
      where: { id },
      include: {
        publisher: true,
        category: true,
        supplier: true,
        attachments: true,
        auditLogs: {
          orderBy: { timestamp: 'desc' },
          take: 20,
          include: {
            user: {
              select: { id: true, username: true, fullName: true }
            }
          }
        }
      }
    });

    if (!software) {
      return res.status(404).json({ error: 'Software not found' });
    }

    res.json(software);
  } catch (error) {
    console.error('Error fetching software:', error);
    res.status(500).json({ error: 'Failed to fetch software' });
  }
});

// Create software
router.post('/', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const {
      itemNumber,
      name,
      publisherId,
      categoryId,
      description,
      version,
      url,
      appStore,
      deploymentMechanism,
      status,
      businessPurpose,
      businessOwner,
      technicalOwner,
      initialInstallDate,
      licenseExpiration,
      licenseCount,
      supplierId,
      lastReviewDate,
      decommissionDate,
      comments,
      criticalityTier,
      dataClassification,
      hostingType,
      supportType,
      internetFacing
    } = req.body;

    if (!itemNumber) {
      return res.status(400).json({ error: 'Item number is required' });
    }
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const software = await prisma.software.create({
      data: {
        itemNumber,
        name,
        publisherId,
        categoryId,
        description,
        version,
        url,
        appStore,
        deploymentMechanism,
        status: status || 'Planned',
        businessPurpose,
        businessOwner,
        technicalOwner,
        initialInstallDate: initialInstallDate ? new Date(initialInstallDate) : null,
        licenseExpiration: licenseExpiration ? new Date(licenseExpiration) : null,
        licenseCount: licenseCount ? parseInt(licenseCount, 10) : null,
        supplierId,
        lastReviewDate: lastReviewDate ? new Date(lastReviewDate) : null,
        decommissionDate: decommissionDate ? new Date(decommissionDate) : null,
        comments,
        criticalityTier,
        dataClassification,
        hostingType,
        supportType,
        internetFacing: internetFacing === undefined ? undefined : internetFacing
      },
      include: {
        publisher: true,
        category: true,
        supplier: true
      }
    });

    await prisma.softwareAuditLog.create({
      data: {
        softwareId: software.id,
        userId: req.session.userId,
        action: 'CREATE',
        changes: JSON.stringify(req.body),
        ipAddress: req.ip
      }
    });

    res.status(201).json(software);
  } catch (error: any) {
    console.error('Error creating software:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Item number already exists' });
    }
    res.status(500).json({ error: 'Failed to create software' });
  }
});

// Update software
router.put('/:id', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    const current = await prisma.software.findUnique({ where: { id } });
    if (!current) {
      return res.status(404).json({ error: 'Software not found' });
    }

    const {
      itemNumber,
      name,
      publisherId,
      categoryId,
      description,
      version,
      url,
      appStore,
      deploymentMechanism,
      status,
      businessPurpose,
      businessOwner,
      technicalOwner,
      initialInstallDate,
      licenseExpiration,
      licenseCount,
      supplierId,
      lastReviewDate,
      decommissionDate,
      comments,
      criticalityTier,
      dataClassification,
      hostingType,
      supportType,
      internetFacing
    } = req.body;

    const software = await prisma.software.update({
      where: { id },
      data: {
        itemNumber,
        name,
        publisherId,
        categoryId,
        description,
        version,
        url,
        appStore,
        deploymentMechanism,
        status,
        businessPurpose,
        businessOwner,
        technicalOwner,
        initialInstallDate: initialInstallDate ? new Date(initialInstallDate) : null,
        licenseExpiration: licenseExpiration ? new Date(licenseExpiration) : null,
        licenseCount: licenseCount !== undefined ? (licenseCount ? parseInt(licenseCount, 10) : null) : undefined,
        supplierId,
        lastReviewDate: lastReviewDate ? new Date(lastReviewDate) : null,
        decommissionDate: decommissionDate ? new Date(decommissionDate) : null,
        comments,
        criticalityTier,
        dataClassification,
        hostingType,
        supportType,
        internetFacing: internetFacing === undefined ? undefined : internetFacing
      },
      include: {
        publisher: true,
        category: true,
        supplier: true
      }
    });

    // Create audit log - only log actual changes
    const normalizeValue = (value: any): any => {
      if (value instanceof Date) {
        return value.toISOString().split('T')[0];
      }
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        return value.split('T')[0];
      }
      return value;
    };

    const resolveLookupValue = async (fieldName: string, fieldValue: any): Promise<string | null> => {
      if (!fieldValue) return null;

      if (fieldName === 'categoryId') {
        const category = await prisma.softwareCategory.findUnique({ where: { id: fieldValue } });
        return category?.name || fieldValue;
      } else if (fieldName === 'publisherId') {
        const publisher = await prisma.softwarePublisher.findUnique({ where: { id: fieldValue } });
        return publisher?.name || fieldValue;
      } else if (fieldName === 'supplierId') {
        const supplier = await prisma.supplier.findUnique({ where: { id: fieldValue } });
        return supplier?.name || fieldValue;
      }
      return fieldValue;
    };

    const beforeData: Record<string, any> = {};
    const afterData: Record<string, any> = {};
    let hasChanges = false;

    for (const [key, value] of Object.entries(req.body)) {
      const currentValue = normalizeValue((current as any)[key]);
      const newValue = normalizeValue(value);

      if (JSON.stringify(currentValue) !== JSON.stringify(newValue)) {
        if (['categoryId', 'publisherId', 'supplierId'].includes(key)) {
          beforeData[key] = await resolveLookupValue(key, (current as any)[key]);
          afterData[key] = await resolveLookupValue(key, value);
        } else {
          beforeData[key] = currentValue;
          afterData[key] = newValue;
        }
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await prisma.softwareAuditLog.create({
        data: {
          softwareId: id,
          userId: req.session.userId,
          action: 'UPDATE',
          changes: JSON.stringify({ before: beforeData, after: afterData }),
          ipAddress: req.ip
        }
      });
    }

    res.json(software);
  } catch (error: any) {
    console.error('Error updating software:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Item number already exists' });
    }
    res.status(500).json({ error: 'Failed to update software' });
  }
});

// Delete software
router.delete('/:id', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    const software = await prisma.software.findUnique({
      where: { id },
      include: { attachments: true }
    });
    if (!software) {
      return res.status(404).json({ error: 'Software not found' });
    }

    // Remove on-disk attachment files (best-effort - DB rows cascade-delete regardless)
    for (const attachment of software.attachments) {
      fs.unlink(path.join(UPLOAD_DIR, attachment.storagePath), () => {});
    }

    // auditLogs and attachments have cascade delete
    await prisma.software.delete({ where: { id } });

    res.json({ success: true, message: 'Software deleted' });
  } catch (error) {
    console.error('Error deleting software:', error);
    res.status(500).json({ error: 'Failed to delete software' });
  }
});

// Get software history
router.get('/:id/history', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    const logs = await prisma.softwareAuditLog.findMany({
      where: { softwareId: id },
      orderBy: { timestamp: 'desc' },
      include: {
        user: {
          select: { id: true, username: true, fullName: true }
        }
      }
    });

    res.json(logs);
  } catch (error) {
    console.error('Error fetching software history:', error);
    res.status(500).json({ error: 'Failed to fetch software history' });
  }
});

// Upload an attachment
router.post('/:id/attachments', (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  upload.single('file')(req, res, async (err: any) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    try {
      const software = await prisma.software.findUnique({ where: { id } });
      if (!software) {
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Software not found' });
      }

      const storagePath = path.join('software', id, req.file.filename);
      const attachment = await prisma.softwareAttachment.create({
        data: {
          softwareId: id,
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          storagePath
        }
      });

      await prisma.softwareAuditLog.create({
        data: {
          softwareId: id,
          userId: req.session.userId,
          action: 'ATTACHMENT_ADDED',
          changes: JSON.stringify({ originalName: req.file.originalname }),
          ipAddress: req.ip
        }
      });

      res.status(201).json(attachment);
    } catch (error) {
      console.error('Error saving attachment:', error);
      fs.unlink(req.file.path, () => {});
      res.status(500).json({ error: 'Failed to save attachment' });
    }
  });
});

// List attachments
router.get('/:id/attachments', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    const attachments = await prisma.softwareAttachment.findMany({
      where: { softwareId: id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(attachments);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// Download an attachment
router.get('/:id/attachments/:attachmentId', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const attachmentId = req.params.attachmentId as string;

  try {
    const attachment = await prisma.softwareAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const fullPath = path.join(UPLOAD_DIR, attachment.storagePath);
    res.download(fullPath, attachment.originalName, (err) => {
      if (err) {
        console.error('Error downloading attachment:', err);
        if (!res.headersSent) {
          res.status(404).json({ error: 'File not found on disk' });
        }
      }
    });
  } catch (error) {
    console.error('Error fetching attachment:', error);
    res.status(500).json({ error: 'Failed to fetch attachment' });
  }
});

// Delete an attachment
router.delete('/:id/attachments/:attachmentId', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;
  const attachmentId = req.params.attachmentId as string;

  try {
    const attachment = await prisma.softwareAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    fs.unlink(path.join(UPLOAD_DIR, attachment.storagePath), () => {});
    await prisma.softwareAttachment.delete({ where: { id: attachmentId } });

    await prisma.softwareAuditLog.create({
      data: {
        softwareId: id as string,
        userId: req.session.userId,
        action: 'ATTACHMENT_REMOVED',
        changes: JSON.stringify({ originalName: attachment.originalName }),
        ipAddress: req.ip
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

export default router;
