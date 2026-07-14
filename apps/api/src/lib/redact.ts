import { Request } from 'express';

export function canViewDevicePasswords(req: Request): boolean {
  return req.session.role === 'ADMIN' || req.session.canViewDevicePasswords === true;
}

export function canViewStudentPasswords(req: Request): boolean {
  return req.session.role === 'ADMIN' || req.session.canViewStudentPasswords === true;
}

export function redactAssetPassword<T extends { devicePassword?: string | null }>(
  asset: T,
  allowed: boolean
): T {
  return allowed ? asset : { ...asset, devicePassword: null };
}

export function redactStudentPassword<T extends { password?: string | null }>(
  student: T,
  allowed: boolean
): T {
  return allowed ? student : { ...student, password: null };
}
