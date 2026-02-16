import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from './auth.js';

const router = Router();

// Apply auth to all routes
router.use(requireAuth);

// Get stocktake review report - assets grouped by last review date
router.get('/stocktake-review', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const year = req.query.year as string | undefined;
    const status = req.query.status as string | undefined;
    const categoryId = req.query.category as string | undefined;
    const locationId = req.query.location as string | undefined;
    const overdueMonthsParam = req.query.overdueMonths as string | undefined;

    const overdueMonths = parseInt(overdueMonthsParam || '12', 10);

    // Fetch all non-decommissioned assets
    const assets = await prisma.asset.findMany({
      where: {
        status: {
          not: { startsWith: 'Decommissioned' }
        },
        ...(categoryId ? { categoryId } : {}),
        ...(locationId ? { locationId } : {})
      },
      select: {
        id: true,
        itemNumber: true,
        model: true,
        serialNumber: true,
        status: true,
        lastReviewDate: true,
        category: {
          select: { id: true, name: true }
        },
        location: {
          select: { id: true, name: true }
        },
        manufacturer: {
          select: { id: true, name: true }
        }
      },
      orderBy: { itemNumber: 'asc' }
    });

    // Process assets to add computed fields
    const now = Date.now();
    const msPerDay = 86400000;
    const overdueMs = overdueMonths * 30 * msPerDay;

    const processedAssets = assets.map((asset) => {
      const lastReviewDate = asset.lastReviewDate
        ? asset.lastReviewDate.toISOString()
        : null;

      const reviewYear = asset.lastReviewDate
        ? asset.lastReviewDate.getFullYear()
        : null;

      const daysSinceReview = asset.lastReviewDate
        ? Math.floor((now - asset.lastReviewDate.getTime()) / msPerDay)
        : null;

      let reviewStatus: 'reviewed' | 'overdue' | 'never';
      if (!asset.lastReviewDate) {
        reviewStatus = 'never';
      } else if (now - asset.lastReviewDate.getTime() > overdueMs) {
        reviewStatus = 'overdue';
      } else {
        reviewStatus = 'reviewed';
      }

      return {
        id: asset.id,
        itemNumber: asset.itemNumber,
        model: asset.model,
        serialNumber: asset.serialNumber,
        category: asset.category,
        location: asset.location,
        manufacturer: asset.manufacturer,
        status: asset.status,
        lastReviewDate,
        reviewYear,
        reviewStatus,
        daysSinceReview
      };
    });

    // Build summary from full list
    const currentYear = new Date().getFullYear();
    const summary = {
      totalAssets: processedAssets.length,
      reviewedThisYear: processedAssets.filter(
        (a) => a.reviewYear === currentYear
      ).length,
      overdueCount: processedAssets.filter(
        (a) => a.reviewStatus === 'overdue'
      ).length,
      neverReviewedCount: processedAssets.filter(
        (a) => a.reviewStatus === 'never'
      ).length
    };

    // Build byYear grouping
    const yearMap = new Map<number, number>();
    processedAssets.forEach((asset) => {
      if (asset.reviewYear) {
        yearMap.set(asset.reviewYear, (yearMap.get(asset.reviewYear) || 0) + 1);
      }
    });
    const byYear = Array.from(yearMap.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year);

    // Apply year filter
    let filteredAssets = processedAssets;
    if (year) {
      const yearNum = parseInt(year, 10);
      filteredAssets = filteredAssets.filter((a) => a.reviewYear === yearNum);
    }

    // Apply status filter
    if (status && ['reviewed', 'overdue', 'never'].includes(status)) {
      filteredAssets = filteredAssets.filter(
        (a) => a.reviewStatus === status
      );
    }

    res.json({
      summary,
      byYear,
      assets: filteredAssets,
      meta: {
        overdueThresholdMonths: overdueMonths,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching stocktake review report:', error);
    res.status(500).json({ error: 'Failed to fetch stocktake review report' });
  }
});

// Get warranty expiry report
router.get('/warranty', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const daysParam = req.query.days as string | undefined;
    const categoryId = req.query.category as string | undefined;
    const locationId = req.query.location as string | undefined;

    const days = parseInt(daysParam || '90', 10);

    // Fetch all non-decommissioned assets
    const assets = await prisma.asset.findMany({
      where: {
        status: { not: { startsWith: 'Decommissioned' } },
        ...(categoryId ? { categoryId } : {}),
        ...(locationId ? { locationId } : {})
      },
      select: {
        id: true,
        itemNumber: true,
        model: true,
        serialNumber: true,
        status: true,
        warrantyExpiration: true,
        manufacturer: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } }
      },
      orderBy: { warrantyExpiration: 'asc' }
    });

    const now = Date.now();
    const msPerDay = 86400000;
    const thresholdMs = days * msPerDay;

    const processedAssets = assets.map((asset) => {
      const warrantyExpiration = asset.warrantyExpiration
        ? asset.warrantyExpiration.toISOString()
        : null;

      let daysUntilExpiry: number | null = null;
      let warrantyStatus: 'no_warranty' | 'expired' | 'expiring_soon' | 'ok';

      if (!asset.warrantyExpiration) {
        warrantyStatus = 'no_warranty';
      } else {
        daysUntilExpiry = Math.floor((asset.warrantyExpiration.getTime() - now) / msPerDay);
        if (daysUntilExpiry < 0) {
          warrantyStatus = 'expired';
        } else if (daysUntilExpiry <= days) {
          warrantyStatus = 'expiring_soon';
        } else {
          warrantyStatus = 'ok';
        }
      }

      return {
        id: asset.id,
        itemNumber: asset.itemNumber,
        model: asset.model,
        serialNumber: asset.serialNumber,
        status: asset.status,
        manufacturer: asset.manufacturer,
        category: asset.category,
        location: asset.location,
        warrantyExpiration,
        daysUntilExpiry,
        warrantyStatus
      };
    });

    // Build summary
    const summary = {
      noWarranty: processedAssets.filter((a) => a.warrantyStatus === 'no_warranty').length,
      expired: processedAssets.filter((a) => a.warrantyStatus === 'expired').length,
      expiringSoon: processedAssets.filter((a) => a.warrantyStatus === 'expiring_soon').length,
      ok: processedAssets.filter((a) => a.warrantyStatus === 'ok').length
    };

    // Build byMonth grouping
    const monthMap = new Map<string, number>();
    processedAssets.forEach((asset) => {
      if (asset.warrantyExpiration) {
        const date = new Date(asset.warrantyExpiration);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthMap.set(month, (monthMap.get(month) || 0) + 1);
      }
    });
    const byMonth = Array.from(monthMap.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json({
      summary,
      byMonth,
      assets: processedAssets,
      meta: { thresholdDays: days, generatedAt: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Error fetching warranty report:', error);
    res.status(500).json({ error: 'Failed to fetch warranty report' });
  }
});

// Get condition/fleet health report
router.get('/condition', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const categoryId = req.query.category as string | undefined;
    const locationId = req.query.location as string | undefined;

    const assets = await prisma.asset.findMany({
      where: {
        status: { not: { startsWith: 'Decommissioned' } },
        ...(categoryId ? { categoryId } : {}),
        ...(locationId ? { locationId } : {})
      },
      select: {
        id: true,
        itemNumber: true,
        model: true,
        status: true,
        condition: true,
        category: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } }
      },
      orderBy: { condition: 'asc' }
    });

    // Build summary
    const conditionCounts: Record<string, number> = {};
    const conditionOrder = ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'NON_FUNCTIONAL'];
    conditionOrder.forEach((c) => { conditionCounts[c] = 0; });

    const byConditionMap = new Map<string, number>();
    const byCategoryMap = new Map<string, Record<string, number>>();

    assets.forEach((asset) => {
      const cond = asset.condition || 'GOOD';
      conditionCounts[cond] = (conditionCounts[cond] || 0) + 1;
      byConditionMap.set(cond, (byConditionMap.get(cond) || 0) + 1);

      const catName = asset.category?.name || 'Uncategorized';
      if (!byCategoryMap.has(catName)) {
        const catConds: Record<string, number> = {};
        conditionOrder.forEach((c) => { catConds[c] = 0; });
        byCategoryMap.set(catName, catConds);
      }
      const catConds = byCategoryMap.get(catName)!;
      catConds[cond] = (catConds[cond] || 0) + 1;
    });

    const summary = conditionCounts;

    const byCondition = Array.from(byConditionMap.entries())
      .map(([condition, count]) => ({ condition, count }))
      .sort((a, b) => conditionOrder.indexOf(a.condition) - conditionOrder.indexOf(b.condition));

    const byCategory = Array.from(byCategoryMap.entries())
      .map(([category, counts]) => ({ category, ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);

    res.json({
      summary,
      byCondition,
      byCategory,
      assets,
      meta: { generatedAt: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Error fetching condition report:', error);
    res.status(500).json({ error: 'Failed to fetch condition report' });
  }
});

// Get asset value/financial report
router.get('/value', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const categoryId = req.query.category as string | undefined;
    const locationId = req.query.location as string | undefined;
    const manufacturerId = req.query.manufacturer as string | undefined;

    const assets = await prisma.asset.findMany({
      where: {
        status: { not: { startsWith: 'Decommissioned' } },
        ...(categoryId ? { categoryId } : {}),
        ...(locationId ? { locationId } : {}),
        ...(manufacturerId ? { manufacturerId } : {})
      },
      select: {
        id: true,
        itemNumber: true,
        model: true,
        status: true,
        purchasePrice: true,
        acquiredDate: true,
        category: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        manufacturer: { select: { id: true, name: true } }
      },
      orderBy: { purchasePrice: 'desc' }
    });

    // Build summary
    const assetsWithPrice = assets.filter((a) => a.purchasePrice);
    const totalValue = assetsWithPrice.reduce((sum, a) => sum + (a.purchasePrice || 0), 0);
    const avgValue = assetsWithPrice.length > 0 ? totalValue / assetsWithPrice.length : 0;
    const maxValue = Math.max(...assetsWithPrice.map((a) => a.purchasePrice || 0), 0);
    const minValue = Math.min(...assetsWithPrice.filter((a) => a.purchasePrice && a.purchasePrice > 0).map((a) => a.purchasePrice || 0), Infinity);

    const summary = {
      totalValue: Math.round(totalValue * 100) / 100,
      avgValue: Math.round(avgValue * 100) / 100,
      assetCount: assets.length,
      assetsWithPrice: assetsWithPrice.length,
      assetsWithoutPrice: assets.length - assetsWithPrice.length,
      maxValue: maxValue || 0,
      minValue: minValue === Infinity ? 0 : minValue
    };

    // Group by category
    const byCategoryMap = new Map<string, { count: number; totalValue: number }>();
    assets.forEach((asset) => {
      const catName = asset.category?.name || 'Uncategorized';
      if (!byCategoryMap.has(catName)) {
        byCategoryMap.set(catName, { count: 0, totalValue: 0 });
      }
      const cat = byCategoryMap.get(catName)!;
      cat.count += 1;
      cat.totalValue += asset.purchasePrice || 0;
    });
    const byCategory = Array.from(byCategoryMap.entries())
      .map(([category, data]) => ({
        category,
        count: data.count,
        totalValue: Math.round(data.totalValue * 100) / 100,
        avgValue: Math.round((data.totalValue / data.count) * 100) / 100
      }))
      .sort((a, b) => b.totalValue - a.totalValue);

    // Group by location
    const byLocationMap = new Map<string, { count: number; totalValue: number }>();
    assets.forEach((asset) => {
      const locName = asset.location?.name || 'Unassigned';
      if (!byLocationMap.has(locName)) {
        byLocationMap.set(locName, { count: 0, totalValue: 0 });
      }
      const loc = byLocationMap.get(locName)!;
      loc.count += 1;
      loc.totalValue += asset.purchasePrice || 0;
    });
    const byLocation = Array.from(byLocationMap.entries())
      .map(([location, data]) => ({
        location,
        count: data.count,
        totalValue: Math.round(data.totalValue * 100) / 100
      }))
      .sort((a, b) => b.totalValue - a.totalValue);

    // Group by manufacturer
    const byManufacturerMap = new Map<string, { count: number; totalValue: number }>();
    assets.forEach((asset) => {
      const mfgName = asset.manufacturer?.name || 'Unknown';
      if (!byManufacturerMap.has(mfgName)) {
        byManufacturerMap.set(mfgName, { count: 0, totalValue: 0 });
      }
      const mfg = byManufacturerMap.get(mfgName)!;
      mfg.count += 1;
      mfg.totalValue += asset.purchasePrice || 0;
    });
    const byManufacturer = Array.from(byManufacturerMap.entries())
      .map(([manufacturer, data]) => ({
        manufacturer,
        count: data.count,
        totalValue: Math.round(data.totalValue * 100) / 100,
        avgValue: Math.round((data.totalValue / data.count) * 100) / 100
      }))
      .sort((a, b) => b.totalValue - a.totalValue);

    res.json({
      summary,
      byCategory,
      byLocation,
      byManufacturer,
      assets,
      meta: { generatedAt: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Error fetching value report:', error);
    res.status(500).json({ error: 'Failed to fetch value report' });
  }
});

// Get asset lifecycle/age and EOL report
router.get('/lifecycle', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const categoryId = req.query.category as string | undefined;
    const locationId = req.query.location as string | undefined;
    const eolDaysParam = req.query.eolDays as string | undefined;

    const eolDays = parseInt(eolDaysParam || '365', 10);

    const assets = await prisma.asset.findMany({
      where: {
        status: { not: { startsWith: 'Decommissioned' } },
        ...(categoryId ? { categoryId } : {}),
        ...(locationId ? { locationId } : {})
      },
      select: {
        id: true,
        itemNumber: true,
        model: true,
        status: true,
        acquiredDate: true,
        endOfLifeDate: true,
        category: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } }
      },
      orderBy: { endOfLifeDate: 'asc' }
    });

    const now = new Date();
    const msPerDay = 86400000;
    const msPerYear = msPerDay * 365.25;
    const eolThresholdMs = eolDays * msPerDay;

    const processedAssets = assets.map((asset) => {
      let ageYears: number | null = null;
      let ageGroup: string = 'Unknown';

      if (asset.acquiredDate) {
        ageYears = (now.getTime() - asset.acquiredDate.getTime()) / msPerYear;
        if (ageYears < 1) ageGroup = '< 1 year';
        else if (ageYears < 3) ageGroup = '1–3 years';
        else if (ageYears < 5) ageGroup = '3–5 years';
        else if (ageYears < 7) ageGroup = '5–7 years';
        else ageGroup = '7+ years';
      }

      let daysUntilEol: number | null = null;
      let eolStatus: 'no_eol_date' | 'passed' | 'upcoming' | 'ok' = 'no_eol_date';

      if (asset.endOfLifeDate) {
        daysUntilEol = Math.floor((asset.endOfLifeDate.getTime() - now.getTime()) / msPerDay);
        if (daysUntilEol < 0) {
          eolStatus = 'passed';
        } else if (daysUntilEol <= eolDays) {
          eolStatus = 'upcoming';
        } else {
          eolStatus = 'ok';
        }
      }

      return {
        id: asset.id,
        itemNumber: asset.itemNumber,
        model: asset.model,
        status: asset.status,
        category: asset.category,
        location: asset.location,
        acquiredDate: asset.acquiredDate ? asset.acquiredDate.toISOString() : null,
        endOfLifeDate: asset.endOfLifeDate ? asset.endOfLifeDate.toISOString() : null,
        ageYears: ageYears ? Math.round(ageYears * 10) / 10 : null,
        ageGroup,
        daysUntilEol,
        eolStatus
      };
    });

    // Build summary
    const ageGroups = ['< 1 year', '1–3 years', '3–5 years', '5–7 years', '7+ years', 'Unknown'];
    const summary = {
      total: processedAssets.length,
      avgAgeYears: processedAssets.filter((a) => a.ageYears !== null).length > 0
        ? Math.round((processedAssets.reduce((sum, a) => sum + (a.ageYears || 0), 0) /
            processedAssets.filter((a) => a.ageYears !== null).length) * 10) / 10
        : 0,
      noAcquiredDate: processedAssets.filter((a) => a.ageYears === null).length,
      eolPassed: processedAssets.filter((a) => a.eolStatus === 'passed').length,
      eolUpcoming: processedAssets.filter((a) => a.eolStatus === 'upcoming').length
    };

    // Build byAgeGroup
    const ageGroupMap = new Map<string, number>();
    ageGroups.forEach((ag) => { ageGroupMap.set(ag, 0); });
    processedAssets.forEach((asset) => {
      ageGroupMap.set(asset.ageGroup, (ageGroupMap.get(asset.ageGroup) || 0) + 1);
    });
    const byAgeGroup = ageGroups.map((ag) => ({
      ageGroup: ag,
      count: ageGroupMap.get(ag) || 0
    }));

    res.json({
      summary,
      byAgeGroup,
      assets: processedAssets,
      meta: { eolThresholdDays: eolDays, generatedAt: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Error fetching lifecycle report:', error);
    res.status(500).json({ error: 'Failed to fetch lifecycle report' });
  }
});

export default router;
