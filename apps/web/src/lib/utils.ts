import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString();
}

export function formatCurrency(value: string | number | null): string {
  if (value === null || value === undefined) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(num);
}

// MACS Asset Register status categories map onto these existing values as follows:
//   Planned              -> 'Planned'
//   Active               -> 'In Use*', 'Awaiting allocation/delivery/collection', 'Waiting Repair', 'Missing'
//   To-be-decommissioned -> inferred from a populated future decommissionDate (no dedicated status)
//   Decommissioned       -> all 'Decommissioned*' / 'Retired*' values
export const STATUS_LABELS: Record<string, string> = {
  'Planned': 'Planned',
  'In Use': 'In Use',
  'In Use - Infrastructure': 'In Use - Infrastructure',
  'In Use - Loaned to student': 'In Use - Loaned to student',
  'In Use - Loaned to staff': 'In Use - Loaned to staff',
  'Awaiting allocation': 'Awaiting allocation',
  'Awaiting delivery': 'Awaiting delivery',
  'Awaiting collection': 'Awaiting collection',
  'Waiting Repair': 'Waiting Repair',
  'Missing': 'Missing',
  'Decommissioned': 'Decommissioned',
  'Decommissioned - Beyond service age': 'Decommissioned - Beyond service age',
  'Decommissioned - Damaged': 'Decommissioned - Damaged',
  'Decommissioned - Stolen': 'Decommissioned - Stolen',
  'Decommissioned - In storage': 'Decommissioned - In storage',
  'Decommissioned - User left school': 'Decommissioned - User left school',
  'Decommissioned - Written Off': 'Decommissioned - Written Off',
  'Decommissioned - Unreturned': 'Decommissioned - Unreturned'
};

export const CONDITION_LABELS: Record<string, string> = {
  NEW: 'New',
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  FAIR: 'Fair',
  POOR: 'Poor',
  NON_FUNCTIONAL: 'Non-functional'
};

export const STATUS_COLORS: Record<string, string> = {
  'Planned': 'bg-blue-100 text-blue-800',
  'In Use': 'bg-green-100 text-green-800',
  'In Use - Loaned to student': 'bg-green-100 text-green-800',
  'In Use - Loaned to staff': 'bg-green-100 text-green-800',
  'Awaiting allocation': 'bg-yellow-100 text-yellow-800',
  'Awaiting delivery': 'bg-yellow-100 text-yellow-800',
  'Awaiting collection': 'bg-yellow-100 text-yellow-800',
  'Waiting Repair': 'bg-orange-100 text-orange-800',
  'Missing': 'bg-red-100 text-red-800',
  'Decommissioned - Beyond service age': 'bg-gray-100 text-gray-800',
  'Decommissioned - Damaged': 'bg-gray-100 text-gray-800',
  'Decommissioned - Stolen': 'bg-red-100 text-red-800',
  'Decommissioned - In storage': 'bg-gray-100 text-gray-800',
  'Decommissioned - User left school': 'bg-gray-100 text-gray-800',
  'Decommissioned - Written Off': 'bg-gray-100 text-gray-800',
  'Decommissioned - Unreturned': 'bg-orange-100 text-orange-800',
  'Retired - Uncollected': 'bg-red-100 text-red-800',
  'Retired - Lost': 'bg-red-100 text-red-800'
};

export const CONDITION_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-800',
  EXCELLENT: 'bg-green-100 text-green-800',
  GOOD: 'bg-green-100 text-green-800',
  FAIR: 'bg-yellow-100 text-yellow-800',
  POOR: 'bg-orange-100 text-orange-800',
  NON_FUNCTIONAL: 'bg-red-100 text-red-800'
};

// MACS Asset Register compliance fields (criticality, data classification, hosting, support)
export const CRITICALITY_LABELS: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CROWN_JEWEL: 'Critical'
};

export const CRITICALITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CROWN_JEWEL: 'bg-purple-100 text-purple-800'
};

export const DATA_CLASSIFICATION_LABELS: Record<string, string> = {
  PUBLIC: 'Public',
  INTERNAL: 'Business Use',
  SENSITIVE: 'Confidential',
  RESTRICTED: 'Restricted'
};

export const DATA_CLASSIFICATION_COLORS: Record<string, string> = {
  PUBLIC: 'bg-gray-100 text-gray-800',
  INTERNAL: 'bg-blue-100 text-blue-800',
  SENSITIVE: 'bg-orange-100 text-orange-800',
  RESTRICTED: 'bg-red-100 text-red-800'
};

export const HOSTING_LABELS: Record<string, string> = {
  ON_PREM: 'On-Premises',
  SCHOOL_CLOUD: 'School Managed Cloud',
  MACS_CLOUD: 'MACS Managed Cloud',
  THIRD_PARTY_CLOUD: 'Third-Party Managed Cloud',
  DET_HOSTED: 'DET Managed Hosted'
};

export const SUPPORT_LABELS: Record<string, string> = {
  IN_HOUSE: 'In-house IT',
  SAAS: 'SaaS',
  VENDOR: 'Vendor Supported'
};

// Software register status - separate from the hardware STATUS_LABELS above, which
// doesn't fit software (e.g. "In Use - Loaned to student")
export const SOFTWARE_STATUS_LABELS: Record<string, string> = {
  'Planned': 'Planned',
  'Active': 'Active',
  'Trial': 'Trial',
  'Decommissioned': 'Decommissioned'
};

export const SOFTWARE_STATUS_COLORS: Record<string, string> = {
  'Planned': 'bg-blue-100 text-blue-800',
  'Active': 'bg-green-100 text-green-800',
  'Trial': 'bg-yellow-100 text-yellow-800',
  'Decommissioned': 'bg-gray-100 text-gray-800'
};
