// Lógica pura del panel de Plataforma (superadministrador): estados de empresa, filtros,
// KPIs, segmentos/destinatarios, plantillas de correo y enlaces de WhatsApp.
import { PLANS, type PlanId } from "@/lib/plans";

export type OwnerStatus = "PENDING" | "ACTIVE" | "SUSPENDED";
export type CompanyState = "pending" | "suspended" | "overdue" | "expiring" | "active" | "exempt";

export type PlatformCompany = {
  id: string;
  name: string;
  plan: string;
  isExempt: boolean;
  nextPaymentDueDate: Date | null;
  ownerStatus: OwnerStatus;
  ownerEmail: string;
  createdAt: Date;
  lastActivityAt?: Date | null;
};

const DAY = 86_400_000;
export const EXPIRING_DAYS = 5;
export const NEW_COMPANY_DAYS = 14;
export const INACTIVE_DAYS = 30;

function utcDay(d: Date): number {
  return Math.floor(d.getTime() / DAY);
}

// Días de calendario (UTC) hasta el vencimiento: 0 = hoy, negativo = vencida. null sin fecha.
export function daysUntilDue(due: Date | null, now: Date): number | null {
  return due ? utcDay(due) - utcDay(now) : null;
}

export function companyState(c: PlatformCompany, now: Date): CompanyState {
  if (c.ownerStatus === "PENDING") return "pending";
  if (c.ownerStatus === "SUSPENDED") return "suspended";
  if (c.isExempt) return "exempt";
  const d = daysUntilDue(c.nextPaymentDueDate, now);
  if (d == null) return "active";
  if (d < 0) return "overdue";
  if (d <= EXPIRING_DAYS) return "expiring";
  return "active";
}

export const STATE_LABELS: Record<CompanyState, string> = {
  pending: "Pendiente",
  suspended: "Suspendida",
  overdue: "Vencida",
  expiring: "Por vencer",
  active: "Activa",
  exempt: "Exenta",
};

export type DueFilter = "all" | "today" | "soon" | "overdue" | "none";
export type CompanyFilters = { q: string; state: CompanyState | "all"; plan: string; due: DueFilter };
export const EMPTY_FILTERS: CompanyFilters = { q: "", state: "all", plan: "all", due: "all" };

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function filterCompanies(rows: PlatformCompany[], f: CompanyFilters, now: Date): PlatformCompany[] {
  const q = norm(f.q.trim());
  return rows.filter((c) => {
    if (q && !norm(`${c.name} ${c.ownerEmail}`).includes(q)) return false;
    if (f.state !== "all" && companyState(c, now) !== f.state) return false;
    if (f.plan !== "all" && c.plan !== f.plan) return false;
    if (f.due !== "all") {
      const d = daysUntilDue(c.nextPaymentDueDate, now);
      if (f.due === "none") return d == null;
      if (d == null) return false;
      if (f.due === "today" && d !== 0) return false;
      if (f.due === "soon" && !(d >= 1 && d <= EXPIRING_DAYS)) return false;
      if (f.due === "overdue" && d >= 0) return false;
    }
    return true;
  });
}

export type PlatformKpis = {
  active: number;
  expiring: number;
  overdueOrBlocked: number;
  pending: number;
  incomeUsdCents: number;
  creditRequests: number;
};

export function platformKpis(
  rows: PlatformCompany[],
  now: Date,
  extras: { monthIncomeUsdCents: number; pendingCreditRequests: number }
): PlatformKpis {
  const k: PlatformKpis = { active: 0, expiring: 0, overdueOrBlocked: 0, pending: 0, incomeUsdCents: extras.monthIncomeUsdCents, creditRequests: extras.pendingCreditRequests };
  for (const c of rows) {
    const s = companyState(c, now);
    if (s === "active" || s === "exempt") k.active++;
    else if (s === "expiring") {
      k.active++;
      k.expiring++;
    } else if (s === "overdue" || s === "suspended") k.overdueOrBlocked++;
    else if (s === "pending") k.pending++;
  }
  return k;
}

// --- Segmentos (CRM, marketing y anuncios) ---
export type Segment = "todas" | "nuevas" | "activas" | "por_vencer" | "vencidas" | "suspendidas" | "sin_actividad" | `plan_${PlanId}`;

export const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "nuevas", label: "Nuevas" },
  { id: "activas", label: "Activas" },
  { id: "por_vencer", label: "Por vencer" },
  { id: "vencidas", label: "Vencidas" },
  { id: "suspendidas", label: "Suspendidas" },
  { id: "sin_actividad", label: "Sin actividad" },
  ...Object.values(PLANS).map((p) => ({ id: `plan_${p.id}` as Segment, label: `Plan ${p.label}` })),
];

export function isSegment(v: string): v is Segment {
  return SEGMENTS.some((s) => s.id === v);
}

export function inSegment(c: PlatformCompany, seg: Segment, now: Date): boolean {
  const s = companyState(c, now);
  switch (seg) {
    case "todas":
      return true;
    case "nuevas":
      return now.getTime() - c.createdAt.getTime() <= NEW_COMPANY_DAYS * DAY;
    case "activas":
      return s === "active" || s === "exempt" || s === "expiring";
    case "por_vencer":
      return s === "expiring";
    case "vencidas":
      return s === "overdue";
    case "suspendidas":
      return s === "suspended";
    case "sin_actividad":
      return s !== "pending" && (c.lastActivityAt == null || now.getTime() - c.lastActivityAt.getTime() > INACTIVE_DAYS * DAY);
    default:
      return seg === `plan_${c.plan}`;
  }
}

export type Audience = { kind: "segment"; segment: Segment } | { kind: "selected"; ids: string[] };

// Destinatarios de un correo: solo cuentas con correo real (las de empleados llevan @kyra.local),
// sin cuentas pendientes ni suspendidas salvo que se pida ese segmento o se elijan a mano.
export function selectRecipients<T extends PlatformCompany>(rows: T[], a: Audience, now: Date): T[] {
  const real = rows.filter((c) => c.ownerEmail && !c.ownerEmail.endsWith("@kyra.local"));
  if (a.kind === "selected") {
    const ids = new Set(a.ids);
    return real.filter((c) => ids.has(c.id));
  }
  const allowNonActive = a.segment === "suspendidas";
  return real.filter((c) => (allowNonActive || c.ownerStatus === "ACTIVE") && inSegment(c, a.segment, now));
}

export function audienceLabel(a: Audience): string {
  if (a.kind === "selected") return `${a.ids.length} empresa(s) elegida(s)`;
  return SEGMENTS.find((s) => s.id === a.segment)?.label ?? a.segment;
}

// --- Plantillas ---
export type EmailTemplate = { id: string; label: string; subject: string; message: string };

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "vencimiento",
    label: "Recordatorio de vencimiento",
    subject: "Tu suscripción de KR POS vence pronto",
    message: "Hola {{empresa}},\n\nTu plan {{plan}} vence el {{vencimiento}} ({{dias}}). Para seguir usando KR POS sin interrupciones, renueva desde Ajustes → Mi plan.\n\nGracias por confiar en KR System.",
  },
  {
    id: "bienvenida",
    label: "Bienvenida",
    subject: "Te damos la bienvenida a KR POS",
    message: "Hola {{empresa}},\n\nGracias por unirte a KR POS. Entra a Learning para ver los videos de inicio y escríbenos si necesitas ayuda para configurar tu negocio.",
  },
  {
    id: "novedad",
    label: "Novedad",
    subject: "Novedades en KR POS",
    message: "Hola {{empresa}},\n\nTenemos novedades en KR POS para tu negocio. Entra al sistema para conocerlas.",
  },
  {
    id: "mantenimiento",
    label: "Mantenimiento",
    subject: "Mantenimiento programado de KR POS",
    message: "Hola {{empresa}},\n\nHaremos un mantenimiento programado en KR POS. Durante ese rato el sistema podría no estar disponible. Gracias por tu paciencia.",
  },
  {
    id: "cupon",
    label: "Cupón de descuento",
    subject: "Un regalo para tu suscripción de KR POS",
    message: "Hola {{empresa}},\n\nTe regalamos un cupón para tu suscripción: {{cupon}}.\nCanjéalo en Ajustes → Mi plan, en el paso de pago, con el código {{codigo}}.\n\nGracias por usar KR POS.",
  },
];

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function formatLongDate(d: Date | null): string {
  return d ? `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}` : "sin fecha";
}

export function daysText(days: number | null): string {
  if (days == null) return "sin fecha de vencimiento";
  if (days < 0) return `venció hace ${-days} día${days === -1 ? "" : "s"}`;
  if (days === 0) return "vence hoy";
  return `en ${days} día${days === 1 ? "" : "s"}`;
}

export function fillTemplate(text: string, c: PlatformCompany, now: Date, extra: Record<string, string> = {}): string {
  const vars: Record<string, string> = {
    empresa: c.name,
    plan: PLANS[c.plan as PlanId]?.label ?? c.plan,
    vencimiento: formatLongDate(c.nextPaymentDueDate),
    dias: daysText(daysUntilDue(c.nextPaymentDueDate, now)),
    ...extra,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);
}

// Enlace de WhatsApp (Venezuela por defecto: 0412… pasa a 58412…). null si el número no sirve.
export function whatsappUrl(phone: string | null | undefined, text?: string): string | null {
  const raw = (phone ?? "").replace(/\D/g, "");
  if (raw.length < 8) return null;
  const digits = raw.startsWith("58") ? raw : raw.replace(/^0+/, "58");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

// --- Uso y límites ---
export type UsageLine = { used: number; limit: number | null; ratio: number | null; near: boolean; over: boolean };
export const NEAR_LIMIT_RATIO = 0.8;

export function usageLine(used: number, limit: number | null): UsageLine {
  if (limit == null || limit <= 0) return { used, limit: null, ratio: null, near: false, over: false };
  const ratio = used / limit;
  return { used, limit, ratio, near: ratio >= NEAR_LIMIT_RATIO, over: ratio >= 1 };
}

// --- Aviso en la app: ¿está vigente ahora? ---
export function announcementVisible(a: { active: boolean; startsAt: Date | null; endsAt: Date | null }, now: Date): boolean {
  if (!a.active) return false;
  if (a.startsAt && a.startsAt.getTime() > now.getTime()) return false;
  if (a.endsAt && a.endsAt.getTime() < now.getTime()) return false;
  return true;
}

// Escapa un valor para CSV (comillas, comas, saltos de línea y protección contra fórmulas de Excel).
export function csvCell(v: unknown): string {
  let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
