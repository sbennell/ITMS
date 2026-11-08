import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requirePermission } from './auth.js';
import { redactAssetPassword } from '../lib/redact.js';

const router = Router();

// Apply auth to all routes
router.use(requireAuth, requirePermission('canAccessStocktake'));

// Stocktake screens never show device passwords, so they are never sent
const withoutPassword = <T extends { asset: { devicePassword?: string | null } }>(record: T): T => ({
  ...record,
  asset: redactAssetPassword(record.asset, false)
});

const STOCKTAKE_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const CONDITIONS = ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'NON_FUNCTIONAL'];
const NOT_IN_PROGRESS = 'This stocktake is not in progress';

const isInProgress = async (prisma: PrismaClient, id: string) =>
  (await prisma.stocktake.findUnique({ where: { id }, select: { status: true } }))?.status === 'IN_PROGRESS';

const isInvalidCondition = (condition: unknown) =>
  condition !== undefined && condition !== null && !CONDITIONS.includes(condition as string);

// Get all stocktakes
router.get('/', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const stocktakes = await prisma.stocktake.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        _count: {
          select: { records: true }
        }
      }
    });

    // Get verified counts
    const stocktakesWithStats = await Promise.all(
      stocktakes.map(async (st) => {
        const verifiedCount = await prisma.stocktakeRecord.count({
          where: { stocktakeId: st.id, verified: true }
        });
        return {
          ...st,
          verifiedCount,
          totalCount: st._count.records
        };
      })
    );

    res.json(stocktakesWithStats);
  } catch (error) {
    console.error('Error fetching stocktakes:', error);
    res.status(500).json({ error: 'Failed to fetch stocktakes' });
  }
});

// Get single stocktake with records
router.get('/:id', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    const stocktake = await prisma.stocktake.findUnique({
      where: { id },
      include: {
        records: {
          include: {
            asset: {
              include: {
                category: true,
                location: true,
                manufacturer: true,
                student: { select: { id: true, firstName: true, surname: true } }
              }
            }
          },
          orderBy: { asset: { itemNumber: 'asc' } }
        }
      }
    });

    if (!stocktake) {
      return res.status(404).json({ error: 'Stocktake not found' });
    }

    res.json({ ...stocktake, records: stocktake.records.map(withoutPassword) });
  } catch (error) {
    console.error('Error fetching stocktake:', error);
    res.status(500).json({ error: 'Failed to fetch stocktake' });
  }
});

// Create new stocktake
router.post('/', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const { name, notes, categoryId, locationId } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    // Build asset filter - include all "In Use" assets, awaiting statuses, and "Waiting Repair"
    const assetWhere: any = {
      AND: [
        {
          OR: [
            { status: { startsWith: 'In Use' } },
            { status: 'Awaiting allocation' },
            { status: 'Awaiting delivery' },
            { status: 'Awaiting collection' },
            { status: 'Waiting Repair' }
          ]
        }
      ]
    };
    if (categoryId) assetWhere.AND.push({ categoryId });
    if (locationId) assetWhere.AND.push({ locationId });

    // Get all active assets matching filter
    const assets = await prisma.asset.findMany({
      where: assetWhere,
      select: { id: true }
    });

    if (assets.length === 0) {
      return res.status(400).json({ error: 'No assets found matching the criteria' });
    }

    // Create stocktake with records
    const stocktake = await prisma.stocktake.create({
      data: {
        name,
        startDate: new Date(),
        status: 'IN_PROGRESS',
        notes,
        records: {
          create: assets.map(asset => ({
            assetId: asset.id,
            verified: false
          }))
        }
      },
      include: {
        _count: {
          select: { records: true }
        }
      }
    });

    res.status(201).json({
      ...stocktake,
      verifiedCount: 0,
      totalCount: stocktake._count.records
    });
  } catch (error) {
    console.error('Error creating stocktake:', error);
    res.status(500).json({ error: 'Failed to create stocktake' });
  }
});

// Update stocktake (name, notes, status)
router.put('/:id', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;
  const { name, notes, status } = req.body;

  try {
    const current = await prisma.stocktake.findUnique({ where: { id }, select: { status: true } });
    if (!current) {
      return res.status(404).json({ error: 'Stocktake not found' });
    }
    if (status !== undefined) {
      if (!STOCKTAKE_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${STOCKTAKE_STATUSES.join(', ')}` });
      }
      if (current.status !== 'IN_PROGRESS') {
        return res.status(400).json({ error: NOT_IN_PROGRESS });
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;

    // All or nothing, so a failure cannot leave an open stocktake with some assets updated
    const stocktake = await prisma.$transaction(async (tx) => {
      if (status === 'COMPLETED') {
        updateData.endDate = new Date();

        // Get all verified records with their condition updates
        const verifiedRecords = await tx.stocktakeRecord.findMany({
          where: { stocktakeId: id as string, verified: true },
          select: { assetId: true, newCondition: true }
        });

        if (verifiedRecords.length > 0) {
          // Update lastReviewDate on all verified assets
          await tx.asset.updateMany({
            where: {
              id: { in: verifiedRecords.map(r => r.assetId) }
            },
            data: {
              lastReviewDate: new Date()
            }
          });

          // Update condition for assets where newCondition was specified
          const conditionUpdates = verifiedRecords.filter(r => r.newCondition);
          for (const record of conditionUpdates) {
            await tx.asset.update({
              where: { id: record.assetId },
              data: { condition: record.newCondition! }
            });
          }
        }
      }

      return tx.stocktake.update({
        where: { id },
        data: updateData
      });
    }, { timeout: 30000 });

    res.json(stocktake);
  } catch (error) {
    console.error('Error updating stocktake:', error);
    res.status(500).json({ error: 'Failed to update stocktake' });
  }
});

// Delete stocktake
router.delete('/:id', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    await prisma.stocktake.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting stocktake:', error);
    res.status(500).json({ error: 'Failed to delete stocktake' });
  }
});

// Verify a single asset in stocktake
router.post('/:id/verify/:assetId', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;
  const assetId = req.params.assetId as string;
  const { locationMatch, conditionMatch, newCondition, notes } = req.body;

  try {
    if (isInvalidCondition(newCondition)) {
      return res.status(400).json({ error: 'Invalid condition' });
    }
    if (!(await isInProgress(prisma, id))) {
      return res.status(400).json({ error: NOT_IN_PROGRESS });
    }

    const record = await prisma.stocktakeRecord.update({
      where: {
        stocktakeId_assetId: {
          stocktakeId: id,
          assetId
        }
      },
      data: {
        verified: true,
        verifiedAt: new Date(),
        locationMatch,
        conditionMatch,
        newCondition,
        notes
      },
      include: {
        asset: {
          include: {
            category: true,
            location: true,
            manufacturer: true
          }
        }
      }
    });

    res.json(withoutPassword(record));
  } catch (error) {
    console.error('Error verifying asset:', error);
    res.status(500).json({ error: 'Failed to verify asset' });
  }
});

// Unverify a single asset in stocktake
router.post('/:id/unverify/:assetId', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;
  const assetId = req.params.assetId as string;

  try {
    if (!(await isInProgress(prisma, id))) {
      return res.status(400).json({ error: NOT_IN_PROGRESS });
    }

    const record = await prisma.stocktakeRecord.update({
      where: {
        stocktakeId_assetId: {
          stocktakeId: id,
          assetId
        }
      },
      data: {
        verified: false,
        verifiedAt: null,
        locationMatch: null,
        conditionMatch: null,
        newCondition: null,
        notes: null
      },
      include: {
        asset: {
          include: {
            category: true,
            location: true,
            manufacturer: true
          }
        }
      }
    });

    res.json(withoutPassword(record));
  } catch (error) {
    console.error('Error unverifying asset:', error);
    res.status(500).json({ error: 'Failed to unverify asset' });
  }
});

// Quick verify by item number or barcode scan
// Supports both plain item numbers and QR codes with full label info
router.post('/:id/quick-verify', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;
  const { itemNumber: rawInput, newCondition } = req.body;

  if (!rawInput || typeof rawInput !== 'string') {
    return res.status(400).json({ error: 'Item number is required' });
  }

  // Parse the input - could be plain item number or QR code content
  // QR format with newlines: "Name\nItem:AST-001\nModel\nS/N:123\nOrg"
  // Scanners may strip newlines: "NameItem:AST-001ModelS/N:123Org"
  let itemNumber = rawInput.trim();

  if (rawInput.includes('Item:')) {
    // Extract item number using regex for common formats
    // Supports: AST-001, ASSET123, or just numbers like 1008
    // Handles optional space after colon (Item: 1008 or Item:1008)
    // This handles scanners that strip newlines from QR codes
    const match = rawInput.match(/Item:\s?([A-Z]+-\d+|[A-Z]+\d+|\d+)/i);
    if (match) {
      itemNumber = match[1];
    } else {
      // Fallback: line-based parsing if input has newlines
      const lines = rawInput.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('Item:')) {
          itemNumber = trimmed.substring(5).trim();
          break;
        }
      }
    }
  }

  try {
    if (isInvalidCondition(newCondition)) {
      return res.status(400).json({ error: 'Invalid condition' });
    }
    if (!(await isInProgress(prisma, id))) {
      return res.status(400).json({ error: NOT_IN_PROGRESS });
    }

    // Find the asset
    const asset = await prisma.asset.findUnique({
      where: { itemNumber }
    });

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Find the record in this stocktake
    const record = await prisma.stocktakeRecord.findUnique({
      where: {
        stocktakeId_assetId: {
          stocktakeId: id,
          assetId: asset.id
        }
      }
    });

    if (!record) {
      return res.status(404).json({ error: 'Asset not in this stocktake' });
    }

    if (record.verified) {
      return res.status(400).json({ error: 'Asset already verified', asset: redactAssetPassword(asset, false) });
    }

    // Verify the asset
    const updatedRecord = await prisma.stocktakeRecord.update({
      where: {
        stocktakeId_assetId: {
          stocktakeId: id,
          assetId: asset.id
        }
      },
      data: {
        verified: true,
        verifiedAt: new Date(),
        locationMatch: true,
        conditionMatch: !newCondition,
        newCondition: newCondition || null
      },
      include: {
        asset: {
          include: {
            category: true,
            location: true,
            manufacturer: true
          }
        }
      }
    });

    res.json(withoutPassword(updatedRecord));
  } catch (error) {
    console.error('Error quick verifying asset:', error);
    res.status(500).json({ error: 'Failed to verify asset' });
  }
});

export default router;
