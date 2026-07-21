import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { readFileSync } from 'fs';
import ExcelJS from 'exceljs';
import { requireAuth, requirePermission } from './auth.js';
import { runStudentImport, reconcileAssetsByStudentName } from '../services/studentImporter.js';
import { generateStudentLoginCards } from '../services/studentLoginCardService.js';
import { canViewStudentPasswords, redactStudentPassword } from '../lib/redact.js';

const router = Router();

// Apply auth to all routes
router.use(requireAuth, requirePermission('canAccessStudents'));

// Build the shared students where-clause from list/export query params
function buildStudentWhere(query: Request['query']): Prisma.StudentWhereInput {
  const { search, status, schoolYear, homeGroup } = query;
  const where: Prisma.StudentWhereInput = {};

  if (search) {
    const searchStr = search as string;
    const searchParts = searchStr.trim().split(/\s+/);

    // Build search conditions for full name and individual parts
    const searchConditions: Prisma.StudentWhereInput[] = [
      { firstName: { contains: searchStr } },
      { surname: { contains: searchStr } },
      { email: { contains: searchStr } },
      { username: { contains: searchStr } }
    ];

    // If search contains space, also try full name combinations with startsWith
    if (searchParts.length >= 2) {
      // Try "firstName surname" combination (surname starts with second part)
      searchConditions.push({
        AND: [
          { firstName: { contains: searchParts[0] } },
          { surname: { startsWith: searchParts[1] } }
        ]
      });
      // Try reverse "surname firstName" combination (firstName starts with second part)
      searchConditions.push({
        AND: [
          { firstName: { startsWith: searchParts[1] } },
          { surname: { contains: searchParts[0] } }
        ]
      });
    }

    where.OR = searchConditions;
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

  return where;
}

// List students with pagination, filtering, and sorting
router.get('/', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const {
      page = '1',
      limit = '50',
      sortBy = 'firstName',
      sortOrder = 'asc'
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where = buildStudentWhere(req.query);

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

    const queryParts = query.split(/\s+/);

    // Build search conditions for full name and individual parts
    const searchConditions: Prisma.StudentWhereInput[] = [
      { firstName: { contains: query } },
      { surname: { contains: query } },
      { email: { contains: query } }
    ];

    // If search contains space, also try full name combinations with startsWith
    if (queryParts.length >= 2) {
      // Try "firstName surname" combination (surname starts with second part)
      searchConditions.push({
        AND: [
          { firstName: { contains: queryParts[0] } },
          { surname: { startsWith: queryParts[1] } }
        ]
      });
      // Try reverse "surname firstName" combination (firstName starts with second part)
      searchConditions.push({
        AND: [
          { firstName: { startsWith: queryParts[1] } },
          { surname: { contains: queryParts[0] } }
        ]
      });
    }

    const students = await prisma.student.findMany({
      where: {
        OR: searchConditions
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

// Download student login cards as PDF
router.get('/login-cards', requirePermission('canViewStudentPasswords'), async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const { homeGroup, schoolYear, studentId } = req.query;

    // Build where clause
    const where: Prisma.StudentWhereInput = {
      status: { not: 'Left' }
    };

    if (studentId) {
      where.id = studentId as string;
    } else if (homeGroup) {
      where.homeGroup = homeGroup as string;
    } else if (schoolYear) {
      where.schoolYear = schoolYear as string;
    }

    // Fetch students sorted alphabetically
    const students = await prisma.student.findMany({
      where,
      orderBy: [{ surname: 'asc' }, { firstName: 'asc' }],
      select: {
        firstName: true,
        surname: true,
        homeGroup: true,
        schoolYear: true,
        username: true,
        email: true,
        password: true
      }
    });

    // Generate PDF
    const pdfBytes = await generateStudentLoginCards(students);

    // Determine filename based on filter
    const slugify = (value: string) => value.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');

    let filename = 'login-cards-all.pdf';
    if (studentId) {
      const student = students[0];
      if (student) {
        const parts = [student.firstName, student.surname, student.homeGroup]
          .filter((part): part is string => !!part && part.trim().length > 0)
          .map(slugify);
        filename = `login-card-${parts.join('-')}.pdf`;
      } else {
        filename = 'login-card.pdf';
      }
    } else if (homeGroup) {
      filename = `login-cards-${(homeGroup as string).replace(/\s+/g, '-')}.pdf`;
    } else if (schoolYear) {
      filename = `login-cards-year${schoolYear}.pdf`;
    }

    // Send PDF response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Error generating login cards:', error);
    res.status(500).json({ error: 'Failed to generate login cards' });
  }
});

// Export students (with their assigned assets) to Excel, honoring the same filters as the list view
router.get('/export', async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const where = buildStudentWhere(req.query);
    const { sortBy = 'firstName', sortOrder = 'asc' } = req.query;
    const orderBy: Prisma.StudentOrderByWithRelationInput = {
      [sortBy as string]: sortOrder as 'asc' | 'desc'
    };

    const students = await prisma.student.findMany({
      where,
      orderBy,
      select: {
        firstName: true,
        surname: true,
        homeGroup: true,
        schoolYear: true,
        status: true,
        email: true,
        assets: {
          select: {
            itemNumber: true,
            serialNumber: true,
            model: true,
            category: { select: { name: true } },
            manufacturer: { select: { name: true } }
          },
          orderBy: { itemNumber: 'asc' }
        }
      }
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IT Management System (ITMS)';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Students');
    worksheet.columns = [
      { header: 'First Name', key: 'firstName', width: 16 },
      { header: 'Surname', key: 'surname', width: 16 },
      { header: 'Home Group', key: 'homeGroup', width: 14 },
      { header: 'Year Level', key: 'schoolYear', width: 12 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Item Number', key: 'itemNumber', width: 16 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Manufacturer', key: 'manufacturer', width: 16 },
      { header: 'Model', key: 'model', width: 20 },
      { header: 'Serial Number', key: 'serialNumber', width: 20 }
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

    for (const student of students) {
      const studentColumns = {
        firstName: student.firstName,
        surname: student.surname,
        homeGroup: student.homeGroup,
        schoolYear: student.schoolYear,
        status: student.status,
        email: student.email
      };

      if (student.assets.length === 0) {
        worksheet.addRow(studentColumns);
        continue;
      }

      for (const asset of student.assets) {
        worksheet.addRow({
          ...studentColumns,
          itemNumber: asset.itemNumber,
          category: asset.category?.name,
          manufacturer: asset.manufacturer?.name,
          model: asset.model,
          serialNumber: asset.serialNumber
        });
      }
    }

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `students-export-${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error exporting students:', error);
    res.status(500).json({ error: 'Failed to export students' });
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

    res.json(redactStudentPassword(student, canViewStudentPasswords(req)));
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

    res.status(201).json(redactStudentPassword(student, canViewStudentPasswords(req)));
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

    res.json(redactStudentPassword(student, canViewStudentPasswords(req)));
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
