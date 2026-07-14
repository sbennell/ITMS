import { Request } from 'express';

export function canViewPasswords(req: Request): boolean {
  return req.session.role === 'ADMIN' || req.session.canViewPasswords === true;
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
