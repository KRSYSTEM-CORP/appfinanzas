"use server";

import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant-db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { setSessionCookie, clearSessionCookie } from "@/lib/session";
import { sendPasswordResetEmail } from "@/lib/email";
import { createCompanyWithOwner } from "@/lib/company-provisioning";
import { checkRateLimit, recordFailedAttempt, clearAttempts, rateLimitMessage } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { verifyTurnstileToken } from "@/lib/turnstile";
import {
  EmployeeLoginSchema,
  LoginSchema,
  RequestPasswordResetSchema,
  ResetPasswordSchema,
  SignupSchema,
} from "@/lib/validations";
import type { ActionResult } from "@/lib/types";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const RESET_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const RESET_REQUEST_MAX_ATTEMPTS = 3;

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// A shared POS terminal only ever belongs to one company in practice — once
// anyone (owner or employee) logs in successfully from a device, remember
// that company's code on it for a year so the "Soy empleado" tab can skip
// asking for it again next time (see /login reading this cookie, and
// forgetDeviceCompany() below for switching a device to a different
// company). Not a credential by itself — just a UX shortcut for a field the
// employee login already requires — so it doesn't need to be secret, only
// tamper-resistant enough that a client can't silently log in as a
// different company without still passing a real name+password.
const DEVICE_COMPANY_COOKIE = "device_company";
const DEVICE_COMPANY_MAX_AGE = 60 * 60 * 24 * 365;

async function rememberDeviceCompany(loginCode: string) {
  const store = await cookies();
  store.set(DEVICE_COMPANY_COOKIE, loginCode, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_COMPANY_MAX_AGE,
  });
}

export async function forgetDeviceCompany(): Promise<void> {
  const store = await cookies();
  store.delete(DEVICE_COMPANY_COOKIE);
}

export type RememberedCompany = { code: string; companyName: string | null };

export async function getRememberedCompany(): Promise<RememberedCompany | null> {
  const store = await cookies();
  const code = store.get(DEVICE_COMPANY_COOKIE)?.value;
  if (!code) return null;
  const company = await prisma.company.findUnique({ where: { loginCode: code }, select: { name: true } });
  // A stale cookie pointing at a company that no longer exists (deleted
  // account) still lets the code itself prefill — getCompanyBrandingByCode
  // and loginEmployee() both re-validate it for real, this is just a UX
  // shortcut, not a trust boundary.
  return { code, companyName: company?.name ?? null };
}

// Self-serve: the company is active immediately, with a free trial (see
// createCompanyWithOwner/lib/billing.ts) — no super admin approval step.
// Auto-logs in and lands straight on /pos, the same way the Google signup
// path (app/api/auth/google/callback) does.
export async function signup(formData: FormData): Promise<ActionResult> {
  const ip = await getClientIp();
  const rl = await checkRateLimit("signup", ip, 5, 60 * 60_000);
  if (!rl.allowed) return { success: false, error: rateLimitMessage(rl.retryAfterMinutes) };
  await recordFailedAttempt("signup", ip);

  const turnstileToken = formData.get("cf-turnstile-response");
  const turnstileOk = await verifyTurnstileToken(typeof turnstileToken === "string" ? turnstileToken : "", ip);
  if (!turnstileOk) return { success: false, error: "No pudimos verificar que eres humano. Intenta de nuevo." };

  const parsed = SignupSchema.safeParse({
    companyName: formData.get("companyName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { companyName, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: "Ese correo ya está registrado" };
  }

  const passwordHash = hashPassword(password);
  const { company, branch, user } = await createCompanyWithOwner(companyName, { email, passwordHash });

  await setSessionCookie({ uid: user.id, cid: company.id, companyName: company.name, bid: branch.id });
  redirect("/pos");
}

export type LoginResult =
  | { success: true }
  | { success: false; error: string }
  | { success: false; needsBranch: true; branches: { id: string; name: string }[] };

export async function login(formData: FormData): Promise<LoginResult> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { email, password } = parsed.data;
  const genericError = "Correo o contraseña incorrectos";

  const limit = await checkRateLimit("login", email, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
  if (!limit.allowed) {
    return { success: false, error: rateLimitMessage(limit.retryAfterMinutes) };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { company: true },
  });
  // user.passwordHash is null on an account that only ever signed up with
  // Google (see app/api/auth/google/callback) — a password attempt against
  // it must fail the same generic way as a non-existent email, not throw.
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    await recordFailedAttempt("login", email);
    return { success: false, error: genericError };
  }
  await clearAttempts("login", email);

  if (user.status === "PENDING") {
    return {
      success: false,
      error:
        "Tu cuenta está pendiente de aprobación por un administrador de KR System. Te avisaremos cuando puedas ingresar.",
    };
  }
  if (user.status === "SUSPENDED") {
    return {
      success: false,
      error: "Tu acceso ha sido suspendido. Contacta al administrador de KR System.",
    };
  }

  await rememberDeviceCompany(user.company.loginCode);

  // The owner/GERENTE account itself has no fixed branch (User.branchId is
  // null for them, see prisma/schema.prisma) — if their company has more
  // than one, they pick which one to enter as before the cookie is set.
  // A submitted branchId is trusted only after confirming it's active and
  // actually belongs to this company.
  const submittedBranchId = formData.get("branchId");
  if (typeof submittedBranchId === "string" && submittedBranchId) {
    const branch = await withTenant(user.companyId, (tx) =>
      tx.branch.findFirst({
        where: { id: submittedBranchId, companyId: user.companyId, isActive: true },
      })
    );
    if (!branch) return { success: false, error: genericError };

    await setSessionCookie({
      uid: user.id,
      cid: user.companyId,
      companyName: user.company.name,
      bid: branch.id,
    });
    redirect("/pos");
  }

  const branches = await withTenant(user.companyId, (tx) =>
    tx.branch.findMany({
      where: { companyId: user.companyId, isActive: true },
      orderBy: { createdAt: "asc" },
    })
  );
  if (branches.length > 1) {
    return { success: false, needsBranch: true, branches: branches.map((b) => ({ id: b.id, name: b.name })) };
  }

  await setSessionCookie({
    uid: user.id,
    cid: user.companyId,
    companyName: user.company.name,
    bid: branches[0]?.id ?? null,
  });

  redirect("/pos");
}

// Employee login: no email involved — a company's manager creates each
// employee profile (see lib/actions/employees.ts) with just a name and
// password, so staff sign in with their company's short loginCode plus their
// own name+password instead.
export async function loginEmployee(formData: FormData): Promise<ActionResult> {
  const parsed = EmployeeLoginSchema.safeParse({
    companyCode: formData.get("companyCode"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { companyCode, firstName, lastName, password } = parsed.data;
  const genericError = "Código de empresa, nombre o contraseña incorrectos";
  const rateLimitKey = `${companyCode.toUpperCase()}:${firstName}:${lastName}`;

  const limit = await checkRateLimit("login-employee", rateLimitKey, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
  if (!limit.allowed) {
    return { success: false, error: rateLimitMessage(limit.retryAfterMinutes) };
  }

  const company = await prisma.company.findUnique({
    where: { loginCode: companyCode.toUpperCase() },
  });
  if (!company) {
    await recordFailedAttempt("login-employee", rateLimitKey);
    return { success: false, error: genericError };
  }

  const user = await prisma.user.findFirst({
    where: {
      companyId: company.id,
      firstName: { equals: firstName, mode: "insensitive" },
      lastName: { equals: lastName, mode: "insensitive" },
    },
  });
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    await recordFailedAttempt("login-employee", rateLimitKey);
    return { success: false, error: genericError };
  }
  await clearAttempts("login-employee", rateLimitKey);

  if (user.status === "PENDING") {
    return {
      success: false,
      error:
        "Tu cuenta está pendiente de aprobación por un administrador de KR System. Te avisaremos cuando puedas ingresar.",
    };
  }
  if (user.status === "SUSPENDED") {
    return {
      success: false,
      error: "Tu acceso ha sido suspendido. Contacta al gerente de tu empresa.",
    };
  }

  await rememberDeviceCompany(company.loginCode);

  await setSessionCookie({
    uid: user.id,
    cid: user.companyId,
    companyName: company.name,
    // Employees are always pinned to whichever branch they were created
    // under (see createEmployee, lib/actions/employees.ts) — no picker.
    bid: user.branchId,
  });

  redirect("/pos");
}

export async function logout(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}

// Always returns success regardless of whether the email is registered, so
// this form can't be used to discover which emails have accounts.
export async function requestPasswordReset(formData: FormData): Promise<ActionResult> {
  const parsed = RequestPasswordResetSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  // Checked (and recorded) regardless of whether the email is registered —
  // otherwise this endpoint could be used to email-bomb any address, real
  // account or not, without ever tripping a limit.
  const limit = await checkRateLimit(
    "password-reset",
    parsed.data.email,
    RESET_REQUEST_MAX_ATTEMPTS,
    RESET_REQUEST_WINDOW_MS
  );
  if (!limit.allowed) {
    return { success: false, error: rateLimitMessage(limit.retryAfterMinutes) };
  }
  await recordFailedAttempt("password-reset", parsed.data.email);

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user) {
    const rawToken = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    await sendPasswordResetEmail(parsed.data.email, rawToken);
  }

  return { success: true };
}

export async function resetPassword(token: string, formData: FormData): Promise<ActionResult> {
  const parsed = ResetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const genericError = "Este enlace no es válido o ya venció. Solicita uno nuevo.";
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
  });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return { success: false, error: genericError };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: hashPassword(parsed.data.password) },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { success: true };
}

export type CompanyBranding = {
  logoDataUrl: string | null;
  brandColor: string | null;
  brandBackground: string | null;
};

const NO_BRANDING: CompanyBranding = { logoDataUrl: null, brandColor: null, brandBackground: null };

// Public lookups used on the login screen to preview a company's branding
// (logo/colors) before the visitor has authenticated — as soon as the owner
// login identifies itself by email, or the employee login by company code.
// Both always return the same shape whether the lookup key doesn't exist or
// exists without any branding set, so neither can be used to check whether a
// given email/company code is registered.
export async function getCompanyBrandingByEmail(email: string): Promise<CompanyBranding> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return NO_BRANDING;

  const ip = await getClientIp();
  const rl = await checkRateLimit("branding-lookup", ip, 20, 60_000);
  if (!rl.allowed) return NO_BRANDING;
  await recordFailedAttempt("branding-lookup", ip);

  const user = await prisma.user.findUnique({
    where: { email: trimmed },
    select: { company: { select: { logoDataUrl: true, brandColor: true, brandBackground: true } } },
  });
  if (!user) return NO_BRANDING;

  return {
    logoDataUrl: user.company.logoDataUrl,
    brandColor: user.company.brandColor,
    brandBackground: user.company.brandBackground,
  };
}

export async function getCompanyBrandingByCode(companyCode: string): Promise<CompanyBranding> {
  const trimmed = companyCode.trim();
  if (!trimmed) return NO_BRANDING;

  const ip = await getClientIp();
  const rl = await checkRateLimit("branding-lookup", ip, 20, 60_000);
  if (!rl.allowed) return NO_BRANDING;
  await recordFailedAttempt("branding-lookup", ip);

  const company = await prisma.company.findUnique({
    where: { loginCode: trimmed.toUpperCase() },
    select: { logoDataUrl: true, brandColor: true, brandBackground: true },
  });
  if (!company) return NO_BRANDING;

  return {
    logoDataUrl: company.logoDataUrl,
    brandColor: company.brandColor,
    brandBackground: company.brandBackground,
  };
}
