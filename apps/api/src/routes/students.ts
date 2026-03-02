import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { requireAuth } from './auth.js';
import { runStudentImport } from '../services/studentImporter.js';

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
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { surname: { contains: search as string, mode: 'insensitive' } },
        { prefName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { username: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    if (status && status !== '_all') {
      where.status = status as string;
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
          prefName: true,
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
          { firstName: { contains: query, mode: 'insensitive' } },
          { surname: { contains: query, mode: 'insensitive' } },
          { prefName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        firstName: true,
        surname: true,
        prefName: true,
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
      prefName,
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
        prefName: prefName || null,
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
      prefName,
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
      prefName: prefName || null,
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
    // Set studentId to null on all linked assets first (due to onDelete: SetNull)
    await prisma.asset.updateMany({
      where: { studentId: id },
      data: { studentId: null }
    });

    // Then delete the student
    const student = await prisma.student.delete({
      where: { id }
    });

    res.json({ success: true, student });
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

export default router;
