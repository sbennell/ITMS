import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { parse as parseCsv } from 'csv-parse/sync';
import { Workbook } from 'exceljs';
import path from 'path';

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/**
 * Parses a CSV or Excel file from the configured import path and upserts students.
 * Uses column mapping from settings to transform raw headers to internal field names.
 */
export async function runStudentImport(prisma: PrismaClient): Promise<ImportResult> {
  const result: ImportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };

  try {
    // Read settings
    const fileSetting = await prisma.settings.findUnique({ where: { key: 'studentImportFile' } });
    const mappingSetting = await prisma.settings.findUnique({ where: { key: 'studentCsvMapping' } });

    if (!fileSetting || !fileSetting.value) {
      throw new Error('Student import file not configured in settings (studentImportFile)');
    }

    // Normalize path - convert backslashes to forward slashes for Windows compatibility
    const importFile = fileSetting.value.replace(/\\/g, '/');
    let columnMapping: Record<string, string> = {};

    if (mappingSetting?.value) {
      try {
        columnMapping = JSON.parse(mappingSetting.value);
      } catch (e) {
        throw new Error('Invalid column mapping JSON in settings');
      }
    }

    // Validate required fields are mapped
    if (!columnMapping['firstName'] || !columnMapping['surname']) {
      throw new Error('Column mapping must include firstName and surname');
    }

    // Verify the file exists
    if (!readFileSync(importFile, 'utf8')) {
      throw new Error(`File not found: ${importFile}`);
    }

    // Parse file
    const rows = await parseFile(importFile, columnMapping);

    // Track which students are in this import (by firstName + surname + birthdate)
    const importedStudentKeys = new Set<string>();

    // Upsert students
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 because headers are row 1, data starts at row 2

      // Skip students with "Left" status (case-insensitive)
      if (row.status?.toLowerCase() === 'left') {
        continue;
      }

      try {
        // Parse birthdate if provided
        let birthdate: Date | null = null;
        if (row.birthdate) {
          const parsed = parseDate(row.birthdate);
          if (parsed) birthdate = parsed;
        }

        // Create a unique key for this student
        const studentKey = `${row.firstName}|${row.surname}|${birthdate?.toISOString() || ''}`;
        importedStudentKeys.add(studentKey);

        // Upsert by firstName + surname + birthdate combination
        const existing = await prisma.student.findFirst({
          where: {
            firstName: row.firstName,
            surname: row.surname,
            birthdate: birthdate
          }
        });

        if (existing) {
          // Skip existing students - don't update
          result.skipped++;
        } else {
          // Create only new students
          await prisma.student.create({
            data: {
              firstName: row.firstName,
              surname: row.surname,
              birthdate,
              prefName: row.prefName || null,
              homeGroup: row.homeGroup || null,
              schoolYear: row.schoolYear || null,
              status: (row.status ? normalizeStatus(row.status) : 'Active'),
              username: row.username || null,
              edupassUsername: row.edupassUsername || null,
              email: row.email || null,
              password: row.password || null
            }
          });
          result.created++;
        }
      } catch (e) {
        result.errors.push({
          row: rowNum,
          message: e instanceof Error ? e.message : 'Unknown error'
        });
      }
    }

    // Handle students removed from CSV or with "Left" status: delete them and unlink their assets
    try {
      const allStudents = await prisma.student.findMany({
        select: { id: true, firstName: true, surname: true, prefName: true, status: true }
      });

      let deleted = 0;
      for (const student of allStudents) {
        // Check if this student is in the current import
        const isInThisImport = Array.from(importedStudentKeys).some(key => {
          // Key format: "firstName|surname|ISO-date-or-empty"
          return key.startsWith(`${student.firstName}|${student.surname}|`);
        });

        // Delete if: not in current import OR has "Left" status (case-insensitive)
        if (!isInThisImport || student.status?.toLowerCase() === 'left') {
          // Student not in this import or has "Left" status: unlink assets (preserve name) and delete student
          const studentName = `${student.prefName || student.firstName} ${student.surname}`;

          // Update assets first (before cascading delete)
          await prisma.asset.updateMany({
            where: { studentId: student.id },
            data: { studentId: null, assignedTo: studentName }
          });

          // Delete the student
          await prisma.student.delete({
            where: { id: student.id }
          });

          deleted++;
        }
      }

      if (deleted > 0) {
        result.errors.push({
          row: 0,
          message: `${deleted} student(s) deleted (not in CSV or has Left status)`
        });
      }
    } catch (e) {
      result.errors.push({
        row: 0,
        message: `Error processing student removals: ${e instanceof Error ? e.message : 'Unknown error'}`
      });
    }

    // Update last import timestamp
    await prisma.settings.upsert({
      where: { key: 'studentLastImport' },
      create: {
        key: 'studentLastImport',
        value: new Date().toISOString()
      },
      update: {
        value: new Date().toISOString()
      }
    });

    // Run reconciliation if enabled
    const reconcileSetting = await prisma.settings.findUnique({
      where: { key: 'studentReconcileOnImport' }
    });
    if (reconcileSetting?.value === 'true') {
      const reconcileResult = await reconcileAssetsByStudentName(prisma);
      // Merge reconciliation results into import result
      if (reconcileResult) {
        result.errors.push({
          row: 0,
          message: `Reconciliation: ${reconcileResult.linked} linked, ${reconcileResult.skipped} skipped`
        });
      }
    }
  } catch (e) {
    // Catastrophic error - add to errors and return
    result.errors.push({
      row: 0,
      message: e instanceof Error ? e.message : 'Unknown error occurred during import'
    });
  }

  return result;
}

/**
 * Parses a CSV or Excel file and applies column mapping.
 * Returns an array of student objects with internal field names.
 */
async function parseFile(
  filePath: string,
  columnMapping: Record<string, string>
): Promise<Record<string, any>[]> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.csv') {
    return parseCsvFile(filePath, columnMapping);
  } else if (['.xlsx', '.xls'].includes(ext)) {
    return parseExcelFile(filePath, columnMapping);
  }

  throw new Error(`Unsupported file format: ${ext}`);
}

/**
 * Parses a CSV file.
 */
function parseCsvFile(
  filePath: string,
  columnMapping: Record<string, string>
): Record<string, any>[] {
  const content = readFileSync(filePath, 'utf-8');
  const records = parseCsv(content, {
    columns: true,
    skip_empty_lines: true
  }) as Record<string, string>[];

  return mapRecords(records, columnMapping);
}

/**
 * Parses an Excel file.
 */
async function parseExcelFile(
  filePath: string,
  columnMapping: Record<string, string>
): Promise<Record<string, any>[]> {
  const workbook = new Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet(1);

  if (!worksheet) {
    throw new Error('No worksheet found in Excel file');
  }

  const records: Record<string, string>[] = [];
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];

  // Extract headers
  headerRow.eachCell((cell, colNum) => {
    headers[colNum - 1] = cell.value?.toString() || '';
  });

  // Extract data rows
  for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
    const row = worksheet.getRow(rowNum);
    const record: Record<string, string> = {};

    headers.forEach((header, idx) => {
      const cell = row.getCell(idx + 1);
      record[header] = cell.value?.toString() || '';
    });

    // Skip empty rows
    if (Object.values(record).some(v => v !== '')) {
      records.push(record);
    }
  }

  return mapRecords(records, columnMapping);
}

/**
 * Applies column mapping to raw records.
 * Transforms CSV headers (keys) to internal field names.
 */
function mapRecords(
  records: Record<string, string>[],
  columnMapping: Record<string, string>
): Record<string, any>[] {
  // Reverse the mapping: CSV header -> internal field name
  const reverseMapping: Record<string, string> = {};
  for (const [internalField, csvHeader] of Object.entries(columnMapping)) {
    reverseMapping[csvHeader] = internalField;
  }

  return records.map(record => {
    const mapped: Record<string, any> = {};

    for (const [csvHeader, value] of Object.entries(record)) {
      const internalField = reverseMapping[csvHeader];
      if (internalField) {
        mapped[internalField] = value.trim();
      }
    }

    return mapped;
  });
}

/**
 * Parses a date string in various formats.
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();

  // Try ISO format first
  const isoMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    const parsed = new Date(isoMatch[0]);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Try DD/MM/YYYY
  const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ddmmyyyyMatch) {
    const [, day, month, year] = ddmmyyyyMatch;
    const parsed = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Try MM/DD/YYYY
  const mmddyyyyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mmddyyyyMatch) {
    const [, month, day, year] = mmddyyyyMatch;
    const parsed = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

/**
 * Normalize status field to title case (e.g., "LEFT" -> "Left", "left" -> "Left")
 */
function normalizeStatus(status: string): string {
  if (!status) return status;
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

/**
 * Reconciles assets by matching their free-text `assignedTo` field against student names.
 * If a unique match is found, the asset is linked to the student (studentId set, assignedTo cleared).
 * Returns a summary of linked, skipped, and unmatched assets.
 */
export interface ReconcileAssetResult {
  linked: number;
  skipped: number;
  unmatched: string[];
}

export async function reconcileAssetsByStudentName(prisma: PrismaClient): Promise<ReconcileAssetResult> {
  const result: ReconcileAssetResult = {
    linked: 0,
    skipped: 0,
    unmatched: []
  };

  try {
    // 1. Find all assets with assignedTo set and no studentId
    const assets = await prisma.asset.findMany({
      where: {
        assignedTo: { not: null },
        studentId: null
      },
      select: { id: true, assignedTo: true }
    });

    if (assets.length === 0) {
      return result;
    }

    // 2. Load all students for matching
    const students = await prisma.student.findMany({
      select: { id: true, firstName: true, surname: true, prefName: true }
    });

    // 3. Build a map of normalized name → studentId
    const nameMap = new Map<string, string | null>();
    for (const s of students) {
      const names = [
        `${s.firstName} ${s.surname}`,
        s.prefName ? `${s.prefName} ${s.surname}` : null,
        `${s.surname}, ${s.firstName}`,
        s.prefName ? `${s.surname}, ${s.prefName}` : null
      ].filter(Boolean);

      // Build set of unique normalized names for this student (avoid duplicates when prefName = firstName)
      const uniqueNames = new Set<string>();
      for (const name of names) {
        uniqueNames.add(name!.toLowerCase().trim());
      }

      // Add each unique name to the map
      for (const key of uniqueNames) {
        if (nameMap.has(key)) {
          nameMap.set(key, null); // Mark as ambiguous (different students, same name)
        } else {
          nameMap.set(key, s.id);
        }
      }
    }

    // 4. Process each asset
    const unmatchedNames = new Set<string>();
    for (const asset of assets) {
      const normalizedAssignedTo = asset.assignedTo!.toLowerCase().trim();
      const studentId = nameMap.get(normalizedAssignedTo);

      if (studentId === null) {
        // Ambiguous (multiple students with same name)
        result.skipped++;
        unmatchedNames.add(asset.assignedTo!);
      } else if (studentId) {
        // Unique match found
        await prisma.asset.update({
          where: { id: asset.id },
          data: { studentId, assignedTo: null }
        });
        result.linked++;
      } else {
        // No match
        result.skipped++;
        unmatchedNames.add(asset.assignedTo!);
      }
    }

    result.unmatched = Array.from(unmatchedNames);
    return result;
  } catch (e) {
    console.error('Error in reconcileAssetsByStudentName:', e);
    throw e;
  }
}
