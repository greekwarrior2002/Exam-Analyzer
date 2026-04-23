/**
 * Tiny CSV helpers. Quotes fields that contain comma, quote, or newline.
 * Escapes embedded quotes by doubling them (RFC 4180).
 */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvField).join(","));
  }
  return lines.join("\n") + "\n";
}

function csvField(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
