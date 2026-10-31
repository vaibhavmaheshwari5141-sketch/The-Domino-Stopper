// CSV downloads: one cell at a time, quoted when needed, and safe to open in a spreadsheet.

export function csvCell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;      // stop spreadsheets reading text as a formula
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Header line plus one line per row, CRLF line endings. */
export function toCsv(header: string[], rows: unknown[][]): string {
  return `${[header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n')}\r\n`;
}
