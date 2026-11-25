// Excel import/export for the browser, on exceljs (audit KRPOS-DEP-001:
// the npm build of SheetJS `xlsx` has unpatched prototype-pollution and ReDoS
// advisories, and these files come from users). Supports .xlsx and .csv (comma or semicolon).

type Cell = string | number | boolean | Date | null | undefined;

// exceljs returns formulas, rich text and hyperlinks as objects; flatten them
// to the plain value a spreadsheet user sees.
function plainValue(value: unknown): string | number | boolean | Date {
  if (value == null) return "";
  if (value instanceof Date || typeof value !== "object") return value as string | number | boolean | Date;
  const v = value as { result?: unknown; richText?: { text: string }[]; text?: unknown };
  if ("result" in v) return plainValue(v.result);
  if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
  if ("text" in v) return plainValue(v.text);
  return "";
}

// CSV con comillas, separador coma o punto y coma (Excel en español usa «;»). Decimales con coma se normalizan
// solo cuando el separador es «;».
export function parseCsvRows(text: string): Record<string, unknown>[] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const table: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      table.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    table.push(row);
  }
  if (table.length === 0) return [];
  const headers = table[0].map((h) => h.trim());
  const rows: Record<string, unknown>[] = [];
  for (const r of table.slice(1)) {
    const obj: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((h, c) => {
      if (!h || UNSAFE_KEYS.has(h)) return;
      let v: string = (r[c] ?? "").trim();
      if (sep === ";" && /^-?\d+(\.\d{3})*,\d+$/.test(v)) v = v.replace(/\./g, "").replace(",", ".");
      else if (sep === ";" && /^-?\d+,\d+$/.test(v)) v = v.replace(",", ".");
      if (v !== "") hasValue = true;
      obj[h] = v;
    });
    if (hasValue) rows.push(obj);
  }
  return rows;
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// First worksheet as one object per row, keyed by the header row — same shape
// as SheetJS's sheet_to_json(sheet, { defval: "" }). Prototype-polluting
// header names are dropped.
export async function readFirstSheet(buffer: ArrayBuffer): Promise<Record<string, unknown>[]> {
  // Un .xlsx es un zip («PK»); cualquier otra cosa se lee como CSV de texto.
  const head = new Uint8Array(buffer.slice(0, 2));
  if (!(head[0] === 0x50 && head[1] === 0x4b)) return parseCsvRows(new TextDecoder("utf-8").decode(buffer));
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new Error("No se pudo leer el archivo. Guárdalo como Excel (.xlsx) e inténtalo de nuevo.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(plainValue(cell.value)).trim();
  });

  const rows: Record<string, unknown>[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const obj: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((header, col) => {
      if (!header || UNSAFE_KEYS.has(header)) return;
      const value = plainValue(row.getCell(col).value);
      if (value !== "") hasValue = true;
      obj[header] = value;
    });
    if (hasValue) rows.push(obj);
  }
  return rows;
}

// Builds an .xlsx from rows of cells (first row = headers) and downloads it.
export async function downloadWorkbook(
  sheets: { name: string; rows: Cell[][] }[],
  fileName: string
): Promise<void> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  for (const { name, rows } of sheets) {
    const sheet = workbook.addWorksheet(name.slice(0, 31));
    for (const row of rows) sheet.addRow(row.map((c) => (c === undefined ? null : c)));
    sheet.getRow(1).font = { bold: true };
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Small builder mirroring the SheetJS calls the export buttons already used
// (book_new / aoa_to_sheet / book_append_sheet / writeFile).
export type WorkbookDraft = { name: string; rows: Cell[][] }[];
export function newWorkbook(): WorkbookDraft {
  return [];
}
export function appendSheet(book: WorkbookDraft, rows: Cell[][], name: string) {
  book.push({ name, rows });
}
