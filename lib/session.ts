import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { isCompanyBlocked, PLATFORM_SETTINGS_ID } from "@/lib/billing";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/session-token";

export async function setSessionCookie(payload: Omit<SessionPayload, "exp">) {
  const token = signSessionToken(payload);
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
  billingExchangeRate: number | null;
  localCurrencyCode: string;
  nextPaymentDueDate: Date | null;
  role: Role;
  // Display name used to attribute sales/quotes — the employee's own name if
  // they have one, otherwise the owner account's email.
  sellerName: string;
  // The branch this session is currently scoped to — null means "every
  // branch" (a GERENTE/owner viewing consolidated data, see switchBranch()
  // in lib/actions/branches.ts). A VENDEDOR is always pinned to their own
  // User.branchId, which wins over whatever's in the cookie (re-derived from
  // the DB here, same as everything else in this function) in case their
  // assignment changes mid-session.
  branchId: string | null;
  branchName: string | null;
};

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  // Re-validate against the DB on every call so a deleted user/company, or a
  // user suspended by a platform admin mid-session, is caught immediately
  // instead of trusting a still-valid signed cookie until it expires.
  const [user, platformSettings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: payload.uid },
      include: {
        company: {
          select: {
            isExempt: true,
            monthlyFeeUsdCents: true,
            nextPaymentDueDate: true,
            localCurrencyCode: true,
          },
        },
      },
    }),
    prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } }),
  ]);
  if (!user || user.companyId !== payload.cid || user.status !== "ACTIVE") return null;

  const isExempt = user.company.isExempt;
  const nextPaymentDueDate = user.company.nextPaymentDueDate;

  // A pinned VENDEDOR always uses their own branch, regardless of cookie
  // contents; a GERENTE/owner (user.branchId null) uses whatever branch the
  // cookie says they last picked/switched to — but only if that branch still
  // exists, is active, and belongs to this same company.
  let branchId = user.branchId;
  if (!branchId && payload.bid) {
    const branch = await prisma.branch.findFirst({
      where: { id: payload.bid, companyId: user.companyId, isActive: true },
      select: { id: true },
    });
    branchId = branch?.id ?? null;
  }
  const branch = branchId
    ? await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } })
    : null;

  return {
    userId: user.id,
    companyId: user.companyId,
    companyName: payload.companyName,
    isSuperAdmin: user.isSuperAdmin,
    // A super admin manages billing for every company, so their own access
    // is never gated by a billing cycle.
    billingBlocked: user.isSuperAdmin ? false : isCompanyBlocked({ isExempt, nextPaymentDueDate }),
    isExempt,
    monthlyFeeUsdCents: user.company.monthlyFeeUsdCents,
    // Platform-wide rate (not per-company) — see PlatformSettings.
    billingExchangeRate:
      platformSettings?.billingExchangeRate != null ? Number(platformSettings.billingExchangeRate) : null,
    localCurrencyCode: user.company.localCurrencyCode,
    nextPaymentDueDate,
    role: user.role,
    sellerName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email,
    branchId,
    branchName: branch?.name ?? null,
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
  if (!session) redirect("/api/auth/clear-session");
  if (session.billingBlocked) redirect("/blocked");
  return session;
}

// Gates Finanzas and Administración de perfiles: GERENTE has full access, a
// platform super admin is also let through (mirrors requireSuperAdmin()'s own
// unrestricted access to /admin), everyone else (VENDEDOR) is bounced to /pos.
export async function requireManager(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "GERENTE" && !session.isSuperAdmin) redirect("/pos");
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
