import { parse } from 'csv-parse/sync';

export interface CsvRow {
  record: Record<string, string>;
  rowNumber: number;
}

// Parse CSV text into records, each with the spreadsheet row it came from, so
// import errors stay correct when blank lines are skipped. csv-parse's line count
// also includes newlines inside quoted cells, which do not start a new row.
export function parseCsvWithRows(content: string, options: { trim?: boolean } = {}): CsvRow[] {
  const parsed = parse(content, {
    ...options,
    bom: true,
    columns: true,
    info: true,
    skip_empty_lines: true
  }) as { record: Record<string, string>; info: { lines: number } }[];

  let cellNewlines = 0;
  return parsed.map(({ record, info }) => {
    cellNewlines += Object.values(record).join('').match(/[\r\n]/g)?.length ?? 0;
    return { record, rowNumber: info.lines - cellNewlines };
  });
}
