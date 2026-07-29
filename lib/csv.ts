export type CsvCell = string | number | boolean | null | undefined;

function safeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const protectedValue = typeof value === 'string' && /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(safeCell).join(','), ...rows.map((row) => row.map(safeCell).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
