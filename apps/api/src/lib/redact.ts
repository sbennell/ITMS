import { Request } from 'express';

export function canViewStudentPasswords(req: Request): boolean {
  return req.session.role === 'ADMIN' || req.session.canViewStudentPasswords === true;
}

// Asset responses never carry the password, it is only released by POST /assets/:id/reveal-password
export function redactAssetPassword<T extends { devicePassword?: string | null }>(
  asset: T
): T & { hasDevicePassword: boolean } {
  return { ...asset, devicePassword: null, hasDevicePassword: !!asset.devicePassword };
}

// Audit entries hold the password at the top level (create) or under before/after (update)
export function maskAuditPasswords(changes: Record<string, any>): Record<string, any> {
  const mask = (fields: Record<string, any>, value = '••••••••••') =>
    fields.devicePassword ? { ...fields, devicePassword: value } : fields;

  // The history screen hides fields whose before and after match, so a real change
  // must stay distinguishable once masked
  const changed = changes.before?.devicePassword !== changes.after?.devicePassword;

  return {
    ...mask(changes),
    ...(changes.before && { before: mask(changes.before) }),
    ...(changes.after && { after: mask(changes.after, changed ? '•••••••••• (changed)' : undefined) })
  };
}

export function redactStudentPassword<T extends { password?: string | null }>(
  student: T,
  allowed: boolean
): T {
  return allowed ? student : { ...student, password: null };
}
