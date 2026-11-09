import { parse } from 'csv-parse/sync';

export interface CsvRow {
  record: Record<string, string>;
  rowNumber: number;
}

// Keep only the fields whose column is in the import file, so an update leaves
// the others unchanged. Records only have keys for columns the file contains.
// fieldColumns names the column for fields stored under a different key.
export function onlyImportedColumns<T extends object>(
  data: T,
  row: object,
  fieldColumns: Record<string, string> = {}
): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([field]) => (fieldColumns[field] ?? field) in row)
  ) as Partial<T>;
}

// True if an import record has any value besides its row number
export function hasImportedValues(record: object): boolean {
  return Object.entries(record).some(
    ([key, value]) => key !== 'rowNumber' && value !== null && value !== undefined && value !== ''
  );
}

// Parse CSV text into records, each with the spreadsheet row it came from, so
// import errors stay correct when blank lines are skipped. csv-parse's line count
// also includes newlines inside quoted cells, which do not start a new row.
// Headers are matched here because every cell, including the header row and cells
// replaced by a duplicate header, must be seen to count those newlines.
export function parseCsvWithRows(content: string, options: { trim?: boolean } = {}): CsvRow[] {
  const parsed = parse(content, {
    ...options,
    bom: true,
    info: true,
    relax_column_count: true,
    skip_empty_lines: true
  }) as unknown as { record: string[]; info: { lines: number } }[];

  let cellNewlines = 0;
  const [header, ...rows] = parsed.map(({ record, info }) => {
    cellNewlines += record.join('').match(/[\r\n]/g)?.length ?? 0;
    return { cells: record, rowNumber: info.lines - cellNewlines };
  });

  return rows.map(({ cells, rowNumber }) => {
    if (cells.length !== header.cells.length) {
      throw new Error(`Row ${rowNumber} has ${cells.length} columns, expected ${header.cells.length}`);
    }
    return { record: Object.fromEntries(header.cells.map((name, i) => [name, cells[i]])), rowNumber };
  });
}

export function parseCsvHeaders(content: string): string[] {
  return (parse(content, { bom: true, to: 1, trim: true }) as string[][])[0] ?? [];
}
