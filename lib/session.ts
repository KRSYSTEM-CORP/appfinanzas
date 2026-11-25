import { DEFAULT_LOCK_MINUTES, type PermissionId } from "@/lib/permissions";
import { canOperateCash, hasPermission, hasSectionAccess, isManagerSession } from "@/lib/access";
import { getPlan, type PlanId } from "@/lib/plans";
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant-db";
import type { Role } from "@prisma/client";
import { isCompanyBlocked } from "@/lib/billing";
import type { AppSection } from "@/lib/sections";
import { hasFeature, isKnownFeature } from "@/lib/features";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/session-token";

export async function setSessionCookie(payload: Omit<SessionPayload, "exp" | "tv">) {
  // Stamp the user's current tokenVersion so a later password change
  // invalidates this cookie (see getSession()).
  const user = await prisma.user.findUnique({ where: { id: payload.uid }, select: { tokenVersion: true } });
  const token = signSessionToken({ ...payload, tv: user?.tokenVersion ?? 0 });
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export type Session = {
  userId: string;
  companyId: string;
  companyName: string;
  isSuperAdmin: boolean;
  billingBlocked: boolean;
  isExempt: boolean;
  monthlyFeeUsdCents: number | null;
  localCurrencyCode: string;
  nextPaymentDueDate: Date | null;
  // Todavía no ha pagado ninguna suscripción: su fecha de vencimiento es el fin de la prueba gratis.
  inTrial: boolean;
  role: Role;
  // Display name used to attribute sales/quotes — the employee's own name if
  // they have one, otherwise the owner account's email.
  sellerName: string;
  // Which sections a VENDEDOR can access — see lib/sections.ts. Empty means
  // unrestricted (see requireSectionAccess below); irrelevant for GERENTE.
  allowedSections: string[];
  // Permisos del rol asignado (lib/permissions.ts). null = sin rol: comportamiento anterior.
  permissions: string[] | null;
  roleName: string | null;
  // Minutos de inactividad antes de bloquear (rol); null = valor por defecto.
  lockMinutes: number | null;
  // Custom per-company features a platform admin enabled for this company
  // (lib/features.ts) — only ids still present in the registry.
  enabledFeatures: string[];
  // Plan de suscripción (lib/plans.ts).
  plan: PlanId;
  // El dueño aún no eligió su plan al crear la cuenta.
  needsPlanChoice: boolean;
  // The branch this session is currently scoped to — null means "every
  // branch" (a GERENTE/owner viewing consolidated data, see switchBranch()
  // in lib/actions/branches.ts). A VENDEDOR is always pinned to their own
  // User.branchId, which wins over whatever's in the cookie (re-derived from
  // the DB here, same as everything else in this function) in case their
  // assignment changes mid-session.
  branchId: string | null;
  branchName: string | null;
  // Sede a la que está fija la persona (User.branchId); null = puede moverse entre sedes (con la clave de cada una).
  pinnedBranchId: string | null;
  // Gates the first-time product tour (components/onboarding/ProductTour.tsx)
  // — false only for a brand-new signup/employee that hasn't clicked through
  // or skipped it yet.
  hasSeenTour: boolean;
  // La pantalla está bloqueada: solo /lock responde hasta ingresar un PIN.
  locked: boolean;
  // Esta persona ya tiene PIN (solo entonces puede bloquear y desbloquear).
  hasPin: boolean;
};

// Memoized per request (React cache): a page renders the layout, the
// metadata and several data loaders in parallel, and each one guards itself
// with requireSession(). Without this every guard re-ran the user + branch
// queries — ~9 round trips per page load for the same answer.
export const getSession = cache(readSession);

type SessionRow = {
  id: string; email: string; companyId: string; branchId: string | null; status: string; isSuperAdmin: boolean;
  firstName: string | null; lastName: string | null; role: string; allowedSections: string[]; hasSeenTour: boolean;
  hasPin: boolean; tokenVersion: number; isExempt: boolean; monthlyFeeUsdCents: number | null;
  nextPaymentDueDate: Date | null; localCurrencyCode: string; enabledFeatures: string[]; plan: string; planChosen: boolean;
  paymentCount: number; roleName: string | null; rolePermissions: string[] | null; roleLockMinutes: number | null;
  branchOkId: string | null; branchName: string | null;
};

async function readSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  // Re-validate against the DB on every call so a deleted user/company, or a
  // user suspended by a platform admin mid-session, is caught immediately
  // instead of trusting a still-valid signed cookie until it expires.
  // Una sola consulta (usuario, empresa, rol y sede) dentro de una sola transacción de la empresa de la
  // cookie firmada: antes eran 2 lecturas del usuario y hasta 3 transacciones más (sede, rol, nombre de sede).
  // A pinned VENDEDOR always uses their own branch, regardless of cookie contents; a GERENTE/owner
  // (user.branchId null) uses whatever branch the cookie says they last picked/switched to — but only
  // if that branch still exists, is active, and belongs to this same company.
  const cookieBid = payload.bid ?? null;
  const rows = await withTenant(payload.cid, (tx) =>
    tx.$queryRaw<SessionRow[]>`
      SELECT u."id", u."email", u."companyId", u."branchId", u."status"::text AS "status", u."isSuperAdmin",
             u."firstName", u."lastName", u."role"::text AS "role", u."allowedSections", u."hasSeenTour",
             (u."pinHash" IS NOT NULL) AS "hasPin", u."tokenVersion",
             c."isExempt", c."monthlyFeeUsdCents", c."nextPaymentDueDate", c."localCurrencyCode", c."enabledFeatures",
             c."plan"::text AS "plan", c."planChosen",
             (SELECT COUNT(*) FROM "Payment" p WHERE p."companyId" = c."id")::int AS "paymentCount",
             r."name" AS "roleName", r."permissions" AS "rolePermissions", r."lockMinutes" AS "roleLockMinutes",
             b."id" AS "branchOkId", b."name" AS "branchName"
      FROM "User" u
      JOIN "Company" c ON c."id" = u."companyId"
      LEFT JOIN "CompanyRole" r ON r."id" = u."roleId"
      LEFT JOIN "Branch" b ON b."id" = COALESCE(u."branchId", ${cookieBid}::text)
        AND b."companyId" = u."companyId" AND (u."branchId" IS NOT NULL OR b."isActive")
      WHERE u."id" = ${payload.uid} AND u."companyId" = ${payload.cid}
    `
  );
  const user = rows[0];
  if (!user || user.status !== "ACTIVE") return null;
  // Revoked by a password change/reset after this cookie was issued.
  if ((payload.tv ?? 0) !== user.tokenVersion) return null;

  const isExempt = user.isExempt;
  const nextPaymentDueDate = user.nextPaymentDueDate;
  const branchId = user.branchOkId ?? null;
  const customRole = user.roleName != null ? { name: user.roleName, permissions: user.rolePermissions ?? [], lockMinutes: user.roleLockMinutes } : null;
  const branch = branchId ? { name: user.branchName } : null;

  return {
    userId: user.id,
    companyId: user.companyId,
    companyName: payload.companyName,
    isSuperAdmin: user.isSuperAdmin,
    // A super admin manages billing for every company, so their own access
    // is never gated by a billing cycle.
    billingBlocked: user.isSuperAdmin ? false : isCompanyBlocked({ isExempt, nextPaymentDueDate }),
    isExempt,
    monthlyFeeUsdCents: user.monthlyFeeUsdCents,
    localCurrencyCode: user.localCurrencyCode,
    nextPaymentDueDate,
    inTrial: !isExempt && user.paymentCount === 0,
    role: user.role as Role,
    sellerName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email,
    allowedSections: user.allowedSections,
    permissions: customRole ? customRole.permissions : null,
    roleName: customRole?.name ?? null,
    lockMinutes: customRole?.lockMinutes ?? (customRole ? DEFAULT_LOCK_MINUTES[customRole.name] ?? null : null),
    enabledFeatures: user.enabledFeatures.filter(isKnownFeature),
    plan: user.plan as PlanId,
    needsPlanChoice: !user.planChosen && user.role === "GERENTE",
    branchId,
    branchName: branch?.name ?? null,
    pinnedBranchId: user.branchId ?? null,
    hasSeenTour: user.hasSeenTour,
    locked: payload.lk === true,
    hasPin: user.hasPin,
  };
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  // A null session here means the signed cookie is still cryptographically
  // valid but failed the DB check above (deleted user/company, or a
  // suspended user) — redirect through the clear-session Route Handler
  // instead of straight to /login so the stale cookie actually gets wiped.
  // Otherwise proxy.ts would see it as valid on the next request and bounce
  // back to /pos, looping forever (see app/api/auth/clear-session/route.ts).
  if (!session) {
    // A rarer, second lookup — only reached when the cookie's already
    // failed validation above — so a previously-signed-in owner suspended
    // by a platform admin mid-session lands on the same "blocked" screen
    // login() shows for a fresh suspended login attempt, instead of a bare
    // /login with no explanation.
    const suspended = await isSuspendedSessionCookie();
    redirect(suspended ? "/api/auth/clear-session?reason=suspended" : "/api/auth/clear-session");
  }
  // Pantalla bloqueada: ninguna acción ni página funciona hasta desbloquear.
  if (session.locked) redirect("/lock");
  if (session.billingBlocked) redirect("/blocked");
  if (session.needsPlanChoice && !session.isSuperAdmin) redirect("/choose-plan");
  return session;
}

async function isSuspendedSessionCookie(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  const payload = verifySessionToken(token);
  if (!payload) return false;
  const user = await prisma.user.findUnique({ where: { id: payload.uid }, select: { status: true } });
  return user?.status === "SUSPENDED";
}

// Gates Finanzas and Administración de perfiles: GERENTE has full access, a
// platform super admin is also let through (mirrors requireSuperAdmin()'s own
// unrestricted access to /admin), everyone else (VENDEDOR) is bounced to /pos.
export async function requireManager(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "GERENTE" && !session.isSuperAdmin) redirect("/pos");
  return session;
}

// Gates a section for a VENDEDOR whose allowedSections was explicitly
// restricted by a manager (see EmployeeTable.tsx) — GERENTE and a platform
// super admin always pass, same as requireManager() above. An empty
// allowedSections array means "no restriction configured," so this only
// ever narrows access down from "everything," never locks out a seller who
// was never touched by this feature.
// Passing several sections lets in a seller who has ANY of them (e.g. a
// quote's PDF is reachable from both Presupuestos and Documentos).
export async function requireSectionAccess(section: AppSection | AppSection[]): Promise<Session> {
  const session = await requireSession();
  const sections = Array.isArray(section) ? section : [section];
  if (hasSectionAccess(session, sections)) return session;
  redirect("/pos");
}

// Gates a per-company custom feature (lib/features.ts): only a session whose
// company has it enabled gets through, everyone else is bounced to /pos as if
// the page didn't exist. Deliberately no super-admin bypass — an admin turns
// a feature on for their own company to try it, same as any customer would.
// Contabilidad solo existe en Pyme y Corporativo; Emprende vuelve a /billing
// para ver los planes.
export async function requireAccountingPlan(): Promise<Session> {
  const session = await requireSession();
  if (!getPlan(session.plan).accounting && !session.isSuperAdmin) redirect("/billing?plan=contabilidad");
  return session;
}

// Compras y proveedores: además del plan, exige el permiso "purchases" (gerente y superadmin siempre lo tienen).
export async function requirePurchasesAccess(): Promise<Session> {
  const session = await requireAccountingPlan();
  if (!hasPermission(session, "purchases")) redirect("/pos");
  return session;
}

// Contabilidad (libros, cuentas por cobrar, nómina): además del plan, exige el permiso "admin".
export async function requireAdminAccess(): Promise<Session> {
  const session = await requireAccountingPlan();
  if (!hasPermission(session, "admin")) redirect("/pos");
  return session;
}

export async function requireFeature(featureId: string): Promise<Session> {
  const session = await requireSession();
  if (!hasFeature(session.enabledFeatures, featureId)) redirect("/pos");
  return session;
}

// Used by actions that operate on ONE concrete branch (creating a product,
// completing a sale, closing the register, etc.) — throws a clear message
// when a GERENTE is in "Todas las sucursales" consolidated view (branchId
// null), since those actions need a single register/catalog to act on. A
// VENDEDOR's session.branchId is never null, so this never fires for them.
export function requireBranchId(session: Session): string {
  if (!session.branchId) {
    throw new Error('Selecciona una sucursal antes de hacer esto — no se puede con "Todas las sucursales".');
  }
  return session.branchId;
}

// Datos que un gerente siempre puede leer y que un rol de vendedor (p. ej. Contador) puede leer si
// tiene alguno de estos permisos. Quien no, vuelve al POS.
export { canOperateCash, hasPermission, isManagerSession };

// Caja Chica (apertura, salidas y cierre): gerente, o un rol con el permiso «Caja Chica» (Cajero).
// Un vendedor sin rol o con el rol Vendedor no entra, aunque vea la pantalla.
export async function requireCashAccess(): Promise<Session> {
  const session = await requireSession();
  if (!canOperateCash(session)) redirect("/pos");
  return session;
}

export async function requireManagerOrPermission(...permissions: PermissionId[]): Promise<Session> {
  const session = await requireSession();
  if (isManagerSession(session) || permissions.some((p) => hasPermission(session, p))) return session;
  redirect("/pos");
}

// Igual que requireManagerOrPermission, pero además exige el plan con Contabilidad.
export async function requireAccountingManagerOrPermission(...permissions: PermissionId[]): Promise<Session> {
  const session = await requireAccountingPlan();
  if (isManagerSession(session) || permissions.some((p) => hasPermission(session, p))) return session;
  redirect("/pos");
}

// Pantallas de gerente que además se pueden apagar por rol (Asistente IA, Sucursales, Ajustes):
// hace falta ser gerente de base Y tener el permiso. Las acciones de esas pantallas ya exigen gerente.
export async function requireManagerPermission(permission: PermissionId): Promise<Session> {
  const session = await requirePermission(permission);
  if (!isManagerSession(session)) redirect("/pos");
  return session;
}

// Valida un permiso en el servidor: quien no lo tiene vuelve al POS.
export async function requirePermission(permission: PermissionId): Promise<Session> {
  const session = await requireSession();
  if (!hasPermission(session, permission)) redirect("/pos");
  return session;
}

// Una persona fija a una sede no puede operar sobre otra: se valida en el servidor, no solo en la pantalla.
export function assertBranchAllowed(session: Pick<Session, "pinnedBranchId">, branchId: string): void {
  if (session.pinnedBranchId && session.pinnedBranchId !== branchId) {
    throw new Error("Tu usuario está fijo a otra sucursal y no puede operar en esta.");
  }
}
