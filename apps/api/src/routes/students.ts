import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { readFileSync } from 'fs';
import { requireAuth } from './auth.js';
import { runStudentImport, reconcileAssetsByStudentName } from '../services/studentImporter.js';

const router = Router();

// Apply auth to all routes
router.use(requireAuth);

// List students with pagination, filtering, and sorting
router.get('/', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const {
      page = '1',
      limit = '50',
      search,
      status,
      schoolYear,
      homeGroup,
      sortBy = 'firstName',
      sortOrder = 'asc'
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: Prisma.StudentWhereInput = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search as string } },
        { surname: { contains: search as string } },
        { email: { contains: search as string } },
        { username: { contains: search as string } }
      ];
    }

    // Build status filter with AND to exclude "Left"
    if (status && status !== '_all') {
      where.AND = [
        { status: status as string },
        { status: { not: 'Left' } }
      ];
    } else {
      // Always exclude students with "Left" status
      where.status = { not: 'Left' };
    }

    if (schoolYear && schoolYear !== '_all') {
      where.schoolYear = schoolYear as string;
    }

    if (homeGroup && homeGroup !== '_all') {
      where.homeGroup = homeGroup as string;
    }

    // Build orderBy
    const orderBy: Prisma.StudentOrderByWithRelationInput = {
      [sortBy as string]: sortOrder as 'asc' | 'desc'
    };

    // Get total count and students
    const [total, students] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where,
        orderBy,
        skip,
        take: limitNum,
        select: {
          id: true,
          firstName: true,
          surname: true,
          homeGroup: true,
          schoolYear: true,
          status: true,
          email: true,
          createdAt: true,
          updatedAt: true
          // Note: password is explicitly NOT returned in list view
        }
      })
    ]);

    res.json({
      data: students,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Search students (lightweight for combobox)
router.get('/search', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const { q = '' } = req.query;
    const query = (q as string).trim();

    if (query.length < 2) {
      return res.json([]);
    }

    const students = await prisma.student.findMany({
      where: {
        OR: [
          { firstName: { contains: query } },
          { surname: { contains: query } },
          { email: { contains: query } }
        ]
      },
      select: {
        id: true,
        firstName: true,
        surname: true,
        schoolYear: true,
        homeGroup: true
      },
      take: 20
    });

    res.json(students);
  } catch (error) {
    console.error('Error searching students:', error);
    res.status(500).json({ error: 'Failed to search students' });
  }
});

// Get unique student statuses (excluding "Left")
router.get('/statuses', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const statuses = await prisma.student.findMany({
      select: { status: true },
      distinct: ['status'],
      where: { status: { not: 'Left' } },
      orderBy: { status: 'asc' }
    });

    const uniqueStatuses = statuses.map(s => s.status).filter(Boolean);
    res.json(uniqueStatuses);
  } catch (error) {
    console.error('Error fetching student statuses:', error);
    res.status(500).json({ error: 'Failed to fetch student statuses' });
  }
});

// Get unique year levels
router.get('/year-levels', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const yearLevels = await prisma.student.findMany({
      select: { schoolYear: true },
      distinct: ['schoolYear'],
      orderBy: { schoolYear: 'asc' }
    });

    const uniqueYearLevels = yearLevels.map(y => y.schoolYear).filter(Boolean);
    res.json(uniqueYearLevels);
  } catch (error) {
    console.error('Error fetching year levels:', error);
    res.status(500).json({ error: 'Failed to fetch year levels' });
  }
});

// Get unique home groups
router.get('/home-groups', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const homeGroups = await prisma.student.findMany({
      select: { homeGroup: true },
      distinct: ['homeGroup'],
      orderBy: { homeGroup: 'asc' }
    });

    const uniqueHomeGroups = homeGroups.map(h => h.homeGroup).filter(Boolean);
    res.json(uniqueHomeGroups);
  } catch (error) {
    console.error('Error fetching home groups:', error);
    res.status(500).json({ error: 'Failed to fetch home groups' });
  }
});

// Get import file headers
router.get('/import/headers', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const fileSetting = await prisma.settings.findUnique({ where: { key: 'studentImportFile' } });

    if (!fileSetting?.value) {
      return res.status(400).json({ error: 'Import file not configured' });
    }

    const filePath = fileSetting.value.replace(/\\/g, '/');
    const content = readFileSync(filePath, 'utf8');
    const firstLine = content.split(/\r?\n/)[0];
    const headers = firstLine
      .split(',')
      .map(h => h.trim().replace(/^"|"$/g, ''));

    res.json(headers);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Import file not found' });
    }
    console.error('Error reading import file headers:', error);
    res.status(500).json({ error: 'Failed to read import file headers' });
  }
});

// Get single student
router.get('/:id', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        assets: {
          select: {
            id: true,
            itemNumber: true,
            model: true,
            categoryId: true,
            status: true,
            createdAt: true,
            category: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json(student);
  } catch (error) {
    console.error('Error fetching student:', error);
    res.status(500).json({ error: 'Failed to fetch student' });
  }
});

// Create student
router.post('/', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const {
      firstName,
      surname,
      homeGroup,
      schoolYear,
      status,
      birthdate,
      username,
      edupassUsername,
      email,
      password
    } = req.body;

    // Validate required fields
    if (!firstName || !surname) {
      return res.status(400).json({ error: 'First name and surname are required' });
    }

    const student = await prisma.student.create({
      data: {
        firstName,
        surname,
        homeGroup: homeGroup || null,
        schoolYear: schoolYear || null,
        status: status || 'Active',
        birthdate: birthdate ? new Date(birthdate) : null,
        username: username || null,
        edupassUsername: edupassUsername || null,
        email: email || null,
        password: password || null
      }
    });

    res.status(201).json(student);
  } catch (error: any) {
    console.error('Error creating student:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A student with this data already exists' });
    }
    res.status(500).json({ error: 'Failed to create student' });
  }
});

// Update student
router.put('/:id', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    const {
      firstName,
      surname,
      homeGroup,
      schoolYear,
      status,
      birthdate,
      username,
      edupassUsername,
      email,
      password
    } = req.body;

    // Validate required fields
    if (!firstName || !surname) {
      return res.status(400).json({ error: 'First name and surname are required' });
    }

    // Build update data
    const updateData: any = {
      firstName,
      surname,
      homeGroup: homeGroup || null,
      schoolYear: schoolYear || null,
      status: status || 'Active',
      birthdate: birthdate ? new Date(birthdate) : null,
      username: username || null,
      edupassUsername: edupassUsername || null,
      email: email || null
    };

    // Only update password if provided and not empty
    if (password && password.trim() !== '') {
      updateData.password = password;
    }

    const student = await prisma.student.update({
      where: { id },
      data: updateData
    });

    res.json(student);
  } catch (error: any) {
    console.error('Error updating student:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// Delete student
router.delete('/:id', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  try {
    // Get student before deleting
    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true, firstName: true, surname: true }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Build student name to restore in assignedTo
    const studentName = `${student.firstName} ${student.surname}`;

    // Set studentId to null and restore name in assignedTo for all linked assets
    await prisma.asset.updateMany({
      where: { studentId: id },
      data: { studentId: null, assignedTo: studentName }
    });

    // Then delete the student
    const deletedStudent = await prisma.student.delete({
      where: { id }
    });

    res.json({ success: true, student: deletedStudent });
  } catch (error: any) {
    console.error('Error deleting student:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Student not found' });
    }
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

// Manual import trigger
router.post('/import/run', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const result = await runStudentImport(prisma);
    res.json(result);
  } catch (error) {
    console.error('Error running student import:', error);
    res.status(500).json({ error: 'Failed to run import' });
  }
});

// Reconcile assets by student name
router.post('/reconcile-assets', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const result = await reconcileAssetsByStudentName(prisma);
    res.json(result);
  } catch (error) {
    console.error('Error reconciling assets:', error);
    res.status(500).json({ error: 'Failed to reconcile assets' });
  }
});

export default router;
