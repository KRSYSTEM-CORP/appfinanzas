// Lógica pura de la segmentación de Cuentas Bancarias (por caja / por fecha): selector de turnos y CSV.
// Sin dependencias de servidor para poder probarla en vitest y usarla en el cliente.

export type SegMode = "caja" | "fecha";

export function parseSegMode(v: string | undefined | null): SegMode {
  return v === "fecha" ? "fecha" : "caja";
}

export type ShiftInfo = {
  date: string; // AAAA-MM-DD (día de la caja)
  shiftNumber: number;
  responsibleName: string | null;
  closed: boolean;
};

export type ShiftOption = { value: string; label: string; open: boolean };

export function shiftValue(date: string, shiftNumber: number): string {
  return `${date}:${shiftNumber}`;
}

export function parseShiftValue(v: string | undefined | null): { date: string; shiftNumber: number } | null {
  const m = /^(\d{4}-\d{2}-\d{2}):(\d{1,3})$/.exec(v ?? "");
  if (!m) return null;
  const n = Number(m[2]);
  return n >= 1 ? { date: m[1], shiftNumber: n } : null;
}

function dayWord(date: string, today: string): string {
  if (date === today) return "Hoy";
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  if (date === d.toISOString().slice(0, 10)) return "Ayer";
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

// Lista de turnos recientes (más nuevo primero) con etiqueta «Hoy · Turno 2 · Ana (abierto)».
export function buildShiftOptions(shifts: ShiftInfo[], today: string): ShiftOption[] {
  return [...shifts]
    .sort((a, b) => (a.date === b.date ? b.shiftNumber - a.shiftNumber : a.date < b.date ? 1 : -1))
    .map((s) => ({
      value: shiftValue(s.date, s.shiftNumber),
      open: !s.closed,
      label: [dayWord(s.date, today), `Turno ${s.shiftNumber}`, s.responsibleName?.trim() || null].filter(Boolean).join(" · ") + (s.closed ? "" : " (abierto)"),
    }));
}

// Turno a mostrar: el pedido si existe; si no, el abierto más reciente; si no, el último.
export function pickShift(options: ShiftOption[], requested: string | null | undefined): ShiftOption | null {
  return options.find((o) => o.value === requested) ?? options.find((o) => o.open) ?? options[0] ?? null;
}

export type CsvMovement = {
  at: string; // ISO
  account: string;
  kind: string;
  label: string;
  amountCents: number; // + ingreso, − egreso
  currency: string;
};

function csvCell(v: string): string {
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const amountText = (cents: number) => (Math.abs(cents) / 100).toFixed(2).replace(".", ",");

function stamp(iso: string): string {
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" });
  return f.format(new Date(iso));
}

// CSV con BOM UTF-8 y separador «;».
export function buildMovementsCsv(rows: CsvMovement[]): string {
  const head = ["Fecha", "Cuenta", "Tipo", "Descripción", "Ingreso", "Egreso", "Moneda"].join(";");
  const lines = rows.map((m) =>
    [stamp(m.at), m.account, m.kind, m.label, m.amountCents > 0 ? amountText(m.amountCents) : "", m.amountCents < 0 ? amountText(m.amountCents) : "", m.currency]
      .map(csvCell)
      .join(";")
  );
  return `﻿${[head, ...lines].join("\r\n")}\r\n`;
}

export function csvFileName(mode: SegMode, from: string, to: string): string {
  return `cuentas-${mode}-${from}-${to}.csv`;
}
