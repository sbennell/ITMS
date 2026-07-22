import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireAdmin } from './auth.js';

const router = Router();

// Apply auth to all routes
router.use(requireAuth);

// ============ CATEGORIES ============

router.get('/categories', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { assets: true } } }
    });
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/categories', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const category = await prisma.category.create({
      data: { name, description }
    });
    res.status(201).json(category);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Category already exists' });
    }
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.put('/categories/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;
  const { name, description } = req.body;

  try {
    const category = await prisma.category.update({
      where: { id },
      data: { name, description }
    });
    res.json(category);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/categories/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    await prisma.category.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Cannot delete category with assets' });
    }
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// ============ MANUFACTURERS ============

router.get('/manufacturers', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  try {
    const manufacturers = await prisma.manufacturer.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { assets: true } } }
    });
    res.json(manufacturers);
  } catch (error) {
    console.error('Error fetching manufacturers:', error);
    res.status(500).json({ error: 'Failed to fetch manufacturers' });
  }
});

router.post('/manufacturers', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const { name, website, supportUrl, contactInfo } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const manufacturer = await prisma.manufacturer.create({
      data: { name, website, supportUrl, contactInfo }
    });
    res.status(201).json(manufacturer);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Manufacturer already exists' });
    }
    console.error('Error creating manufacturer:', error);
    res.status(500).json({ error: 'Failed to create manufacturer' });
  }
});

router.put('/manufacturers/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;
  const { name, website, supportUrl, contactInfo } = req.body;

  try {
    const manufacturer = await prisma.manufacturer.update({
      where: { id },
      data: { name, website, supportUrl, contactInfo }
    });
    res.json(manufacturer);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Manufacturer name already exists' });
    }
    console.error('Error updating manufacturer:', error);
    res.status(500).json({ error: 'Failed to update manufacturer' });
  }
});

router.delete('/manufacturers/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    await prisma.manufacturer.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Cannot delete manufacturer with assets' });
    }
    console.error('Error deleting manufacturer:', error);
    res.status(500).json({ error: 'Failed to delete manufacturer' });
  }
});

// ============ SUPPLIERS ============

router.get('/suppliers', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { assets: true } } }
    });
    res.json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

router.post('/suppliers', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const { name, website, contactInfo, accountNum } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const supplier = await prisma.supplier.create({
      data: { name, website, contactInfo, accountNum }
    });
    res.status(201).json(supplier);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Supplier already exists' });
    }
    console.error('Error creating supplier:', error);
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

router.put('/suppliers/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;
  const { name, website, contactInfo, accountNum } = req.body;

  try {
    const supplier = await prisma.supplier.update({
      where: { id },
      data: { name, website, contactInfo, accountNum }
    });
    res.json(supplier);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Supplier name already exists' });
    }
    console.error('Error updating supplier:', error);
    res.status(500).json({ error: 'Failed to update supplier' });
  }
});

router.delete('/suppliers/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    await prisma.supplier.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Cannot delete supplier with assets' });
    }
    console.error('Error deleting supplier:', error);
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
});

// ============ LOCATIONS ============

router.get('/locations', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  try {
    const locations = await prisma.location.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { assets: true } } }
    });
    res.json(locations);
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

router.post('/locations', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const { name, building, floor, room, address } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const location = await prisma.location.create({
      data: { name, building, floor, room, address }
    });
    res.status(201).json(location);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Location already exists' });
    }
    console.error('Error creating location:', error);
    res.status(500).json({ error: 'Failed to create location' });
  }
});

router.put('/locations/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;
  const { name, building, floor, room, address } = req.body;

  try {
    const location = await prisma.location.update({
      where: { id },
      data: { name, building, floor, room, address }
    });
    res.json(location);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Location name already exists' });
    }
    console.error('Error updating location:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

router.delete('/locations/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    await prisma.location.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Cannot delete location with assets' });
    }
    console.error('Error deleting location:', error);
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

// ============ SOFTWARE PUBLISHERS ============

router.get('/software-publishers', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  try {
    const publishers = await prisma.softwarePublisher.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { software: true } } }
    });
    res.json(publishers);
  } catch (error) {
    console.error('Error fetching software publishers:', error);
    res.status(500).json({ error: 'Failed to fetch software publishers' });
  }
});

router.post('/software-publishers', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const { name, website, supportUrl, contactInfo } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const publisher = await prisma.softwarePublisher.create({
      data: { name, website, supportUrl, contactInfo }
    });
    res.status(201).json(publisher);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Software publisher already exists' });
    }
    console.error('Error creating software publisher:', error);
    res.status(500).json({ error: 'Failed to create software publisher' });
  }
});

router.put('/software-publishers/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;
  const { name, website, supportUrl, contactInfo } = req.body;

  try {
    const publisher = await prisma.softwarePublisher.update({
      where: { id },
      data: { name, website, supportUrl, contactInfo }
    });
    res.json(publisher);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Software publisher name already exists' });
    }
    console.error('Error updating software publisher:', error);
    res.status(500).json({ error: 'Failed to update software publisher' });
  }
});

router.delete('/software-publishers/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    await prisma.softwarePublisher.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Cannot delete publisher with software' });
    }
    console.error('Error deleting software publisher:', error);
    res.status(500).json({ error: 'Failed to delete software publisher' });
  }
});

// ============ SOFTWARE CATEGORIES ============

router.get('/software-categories', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  try {
    const categories = await prisma.softwareCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { software: true } } }
    });
    res.json(categories);
  } catch (error) {
    console.error('Error fetching software categories:', error);
    res.status(500).json({ error: 'Failed to fetch software categories' });
  }
});

router.post('/software-categories', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const category = await prisma.softwareCategory.create({
      data: { name, description }
    });
    res.status(201).json(category);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Software category already exists' });
    }
    console.error('Error creating software category:', error);
    res.status(500).json({ error: 'Failed to create software category' });
  }
});

router.put('/software-categories/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;
  const { name, description } = req.body;

  try {
    const category = await prisma.softwareCategory.update({
      where: { id },
      data: { name, description }
    });
    res.json(category);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Software category name already exists' });
    }
    console.error('Error updating software category:', error);
    res.status(500).json({ error: 'Failed to update software category' });
  }
});

router.delete('/software-categories/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    await prisma.softwareCategory.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    if (error.code === 'P2003') {
      return res.status(400).json({ error: 'Cannot delete category with software' });
    }
    console.error('Error deleting software category:', error);
    res.status(500).json({ error: 'Failed to delete software category' });
  }
});

// ============ SAVED FILTERS ============

router.get('/filters', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  try {
    const filters = await prisma.savedFilter.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(filters);
  } catch (error) {
    console.error('Error fetching filters:', error);
    res.status(500).json({ error: 'Failed to fetch filters' });
  }
});

router.post('/filters', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const { name, filterConfig, sortConfig, isDefault, description } = req.body;

  if (!name || !filterConfig) {
    return res.status(400).json({ error: 'Name and filter config are required' });
  }

  try {
    const filter = await prisma.savedFilter.create({
      data: {
        name,
        filterConfig: typeof filterConfig === 'string' ? filterConfig : JSON.stringify(filterConfig),
        sortConfig: sortConfig ? (typeof sortConfig === 'string' ? sortConfig : JSON.stringify(sortConfig)) : null,
        isDefault,
        description
      }
    });
    res.status(201).json(filter);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Filter name already exists' });
    }
    console.error('Error creating filter:', error);
    res.status(500).json({ error: 'Failed to create filter' });
  }
});

router.delete('/filters/:id', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    await prisma.savedFilter.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting filter:', error);
    res.status(500).json({ error: 'Failed to delete filter' });
  }
});

// ============ SETTINGS ============

router.get('/settings/:key', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const key = req.params.key as string;

  try {
    const setting = await prisma.settings.findUnique({
      where: { key }
    });
    res.json({ key, value: setting?.value || '' });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

router.put('/settings/:key', requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const key = req.params.key as string;
  const { value } = req.body;

  if (value === undefined) {
    return res.status(400).json({ error: 'Value is required' });
  }

  try {
    const setting = await prisma.settings.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });
    res.json({ key: setting.key, value: setting.value });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

export default router;
