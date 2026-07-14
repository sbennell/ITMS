import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';

const router = Router();

const MIN_PASSWORD_LENGTH = 8;
const USER_ROLES = ['ADMIN', 'USER'] as const;

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' }
});

// Per-user feature toggles (only enforced for role=USER; ADMIN always bypasses)
export type PermissionFlag =
  | 'canAccessAssets'
  | 'canAccessStudents'
  | 'canAccessStocktake'
  | 'canAccessReports'
  | 'canViewPasswords';

export const PERMISSION_FLAGS: PermissionFlag[] = [
  'canAccessAssets',
  'canAccessStudents',
  'canAccessStocktake',
  'canAccessReports',
  'canViewPasswords'
];

// Extend session type
declare module 'express-session' {
  interface SessionData {
    authenticated: boolean;
    userId: string;
    username: string;
    role: 'ADMIN' | 'USER';
    fullName: string;
    canAccessAssets: boolean;
    canAccessStudents: boolean;
    canAccessStocktake: boolean;
    canAccessReports: boolean;
    canViewPasswords: boolean;
  }
}

// Check if authenticated
export const requireAuth = (req: Request, res: Response, next: Function) => {
  if (req.session.authenticated) {
    next();
  } else {
    res.status(401).json({ error: 'Authentication required' });
  }
};

// Check if admin
export const requireAdmin = (req: Request, res: Response, next: Function) => {
  if (req.session.authenticated && req.session.role === 'ADMIN') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
};

// Check a specific per-user permission flag; ADMIN always bypasses
export const requirePermission = (flag: PermissionFlag) =>
  (req: Request, res: Response, next: Function) => {
    if (!req.session.authenticated) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.session.role === 'ADMIN' || req.session[flag]) {
      return next();
    }
    return res.status(403).json({ error: 'You do not have permission to access this feature' });
  };

// Same, but passes if the user has ANY of the listed flags (a route serving two feature areas)
export const requireAnyPermission = (...flags: PermissionFlag[]) =>
  (req: Request, res: Response, next: Function) => {
    if (!req.session.authenticated) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.session.role === 'ADMIN' || flags.some((f) => req.session[f])) {
      return next();
    }
    return res.status(403).json({ error: 'You do not have permission to access this feature' });
  };

// Check auth status
router.get('/status', (req: Request, res: Response) => {
  if (req.session.authenticated) {
    res.json({
      authenticated: true,
      user: {
        id: req.session.userId,
        username: req.session.username,
        fullName: req.session.fullName,
        role: req.session.role,
        canAccessAssets: req.session.canAccessAssets,
        canAccessStudents: req.session.canAccessStudents,
        canAccessStocktake: req.session.canAccessStocktake,
        canAccessReports: req.session.canAccessReports,
        canViewPasswords: req.session.canViewPasswords
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Login
router.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // Check if any users exist
    const userCount = await prisma.user.count();

    if (userCount === 0) {
      // No users - create first admin user
      if (password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }
      const hash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          username: username.toLowerCase(),
          passwordHash: hash,
          fullName: username,
          role: 'ADMIN',
          isActive: true,
          lastLogin: new Date()
        }
      });

      req.session.authenticated = true;
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role as 'ADMIN' | 'USER';
      req.session.fullName = user.fullName;
      req.session.canAccessAssets = user.canAccessAssets;
      req.session.canAccessStudents = user.canAccessStudents;
      req.session.canAccessStocktake = user.canAccessStocktake;
      req.session.canAccessReports = user.canAccessReports;
      req.session.canViewPasswords = user.canViewPasswords;

      return res.json({
        success: true,
        message: 'First admin user created',
        user: {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          canAccessAssets: user.canAccessAssets,
          canAccessStudents: user.canAccessStudents,
          canAccessStocktake: user.canAccessStocktake,
          canAccessReports: user.canAccessReports,
          canViewPasswords: user.canViewPasswords
        }
      });
    }

    // Find user by username
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is disabled' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    // Set session
    req.session.authenticated = true;
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role as 'ADMIN' | 'USER';
    req.session.fullName = user.fullName;
    req.session.canAccessAssets = user.canAccessAssets;
    req.session.canAccessStudents = user.canAccessStudents;
    req.session.canAccessStocktake = user.canAccessStocktake;
    req.session.canAccessReports = user.canAccessReports;
    req.session.canViewPasswords = user.canViewPasswords;

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        canAccessAssets: user.canAccessAssets,
        canAccessStudents: user.canAccessStudents,
        canAccessStocktake: user.canAccessStocktake,
        canAccessReports: user.canAccessReports,
        canViewPasswords: user.canViewPasswords
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Change password (current user)
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const { currentPassword, newPassword } = req.body;
  const userId = req.session.userId;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash }
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Verify password (for revealing sensitive data)
router.post('/verify-password', requireAuth, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const { password } = req.body;
  const userId = req.session.userId;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    res.json({ valid });
  } catch (error) {
    console.error('Verify password error:', error);
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

// ============ USER MANAGEMENT (Admin only) ============

// Get all users
router.get('/users', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        canAccessAssets: true,
        canAccessStudents: true,
        canAccessStocktake: true,
        canAccessReports: true,
        canViewPasswords: true,
        isActive: true,
        lastLogin: true,
        createdAt: true
      },
      orderBy: { username: 'asc' }
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create user
router.post('/users', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const { username, password, fullName, role, ...permissions } = req.body;

  if (!username || !password || !fullName) {
    return res.status(400).json({ error: 'Username, password, and full name are required' });
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  if (role !== undefined && !USER_ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${USER_ROLES.join(', ')}` });
  }

  const permissionData: Partial<Record<PermissionFlag, boolean>> = {};
  for (const flag of PERMISSION_FLAGS) {
    if (permissions[flag] !== undefined) {
      permissionData[flag] = !!permissions[flag];
    }
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        passwordHash: hash,
        fullName,
        role: role || 'USER',
        ...permissionData
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        canAccessAssets: true,
        canAccessStudents: true,
        canAccessStocktake: true,
        canAccessReports: true,
        canViewPasswords: true,
        isActive: true,
        createdAt: true
      }
    });
    res.status(201).json(user);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user
router.put('/users/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;
  const { fullName, role, isActive, ...permissions } = req.body;

  if (role !== undefined && !USER_ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${USER_ROLES.join(', ')}` });
  }

  const permissionData: Partial<Record<PermissionFlag, boolean>> = {};
  for (const flag of PERMISSION_FLAGS) {
    if (permissions[flag] !== undefined) {
      permissionData[flag] = !!permissions[flag];
    }
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(fullName !== undefined && { fullName }),
        ...(role !== undefined && { role }),
        ...(isActive !== undefined && { isActive }),
        ...permissionData
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        canAccessAssets: true,
        canAccessStudents: true,
        canAccessStocktake: true,
        canAccessReports: true,
        canViewPasswords: true,
        isActive: true,
        lastLogin: true,
        createdAt: true
      }
    });
    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Reset user password
router.post('/users/:id/reset-password', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required' });
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id },
      data: { passwordHash: hash }
    });
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Delete user
router.delete('/users/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const prisma = req.app.locals.prisma as PrismaClient;
  const id = req.params.id as string;

  // Prevent deleting self
  if (id === req.session.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  try {
    await prisma.user.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
