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
    const pathSetting = await prisma.settings.findUnique({ where: { key: 'studentImportPath' } });
    const filenameSetting = await prisma.settings.findUnique({ where: { key: 'studentImportFilename' } });
    const mappingSetting = await prisma.settings.findUnique({ where: { key: 'studentCsvMapping' } });

    if (!pathSetting || !pathSetting.value) {
      throw new Error('Student import path not configured in settings (studentImportPath)');
    }

    // Normalize path - convert backslashes to forward slashes for Windows compatibility
    const importPath = pathSetting.value.replace(/\\/g, '/');
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

    // Find the file to import (CSV or XLSX)
    const targetFilename = filenameSetting?.value || null;
    const file = findImportFile(importPath, targetFilename);
    if (!file) {
      const errorMsg = targetFilename
        ? `File not found: ${targetFilename} in ${importPath}`
        : `No CSV or Excel file found in ${importPath}`;
      throw new Error(errorMsg);
    }

    // Parse file
    const rows = await parseFile(file, columnMapping);

    // Upsert students
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 because headers are row 1, data starts at row 2

      try {
        // Parse birthdate if provided
        let birthdate: Date | null = null;
        if (row.birthdate) {
          const parsed = parseDate(row.birthdate);
          if (parsed) birthdate = parsed;
        }

        // Upsert by firstName + surname + birthdate combination
        const existing = await prisma.student.findFirst({
          where: {
            firstName: row.firstName,
            surname: row.surname,
            birthdate: birthdate
          }
        });

        if (existing) {
          // Update
          await prisma.student.update({
            where: { id: existing.id },
            data: {
              prefName: row.prefName || undefined,
              homeGroup: row.homeGroup || undefined,
              schoolYear: row.schoolYear || undefined,
              status: row.status || 'Active',
              username: row.username || undefined,
              edupassUsername: row.edupassUsername || undefined,
              email: row.email || undefined,
              password: row.password || undefined
            }
          });
          result.updated++;
        } else {
          // Create
          await prisma.student.create({
            data: {
              firstName: row.firstName,
              surname: row.surname,
              birthdate,
              prefName: row.prefName || null,
              homeGroup: row.homeGroup || null,
              schoolYear: row.schoolYear || null,
              status: row.status || 'Active',
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
 * Finds a CSV or Excel file in the given directory.
 * If targetFilename is specified, looks for that exact file.
 * Otherwise, returns the first CSV/Excel file found.
 */
function findImportFile(dirPath: string, targetFilename: string | null): string | null {
  try {
    const fs = require('fs');
    const files = fs.readdirSync(dirPath);

    // If a specific filename is configured, look for it
    if (targetFilename) {
      if (files.includes(targetFilename)) {
        return path.join(dirPath, targetFilename);
      }
      return null;
    }

    // Otherwise, find the first CSV/Excel file
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (['.csv', '.xlsx', '.xls'].includes(ext)) {
        return path.join(dirPath, file);
      }
    }
    return null;
  } catch {
    return null;
  }
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
