// Minimal CSV reading/writing (RFC 4180: commas, "quoted" fields, "" escapes).
// Works with files saved from Excel or Google Sheets.

/** Parse CSV text into rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, ""); // strip Excel's BOM

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Drop completely empty lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Parse CSV into objects keyed by the (lower-cased, trimmed) header row. */
export function parseCsvObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const [header, ...body] = parseCsv(text);
  if (!header) return { headers: [], rows: [] };
  const headers = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return {
    headers,
    rows: body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()]))),
  };
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Stop spreadsheet apps treating cells as formulas (CSV injection).
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build CSV text from a header list and rows. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}
