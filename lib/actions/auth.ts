"use server";

import { randomInt } from "crypto";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { setSessionCookie, clearSessionCookie } from "@/lib/session";
import { EmployeeLoginSchema, LoginSchema, SignupSchema } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";

// Excludes visually ambiguous characters (0/O, 1/I) since employees will be
// reading this off a screen or a note to type it in themselves.
const LOGIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateLoginCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += LOGIN_CODE_ALPHABET[randomInt(LOGIN_CODE_ALPHABET.length)];
  }
  return code;
}

export async function signup(formData: FormData): Promise<ActionResult> {
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

  // New accounts start PENDING and can't log in until a KR System platform
  // admin approves them from /admin — no session is created here. loginCode
  // is the short code employees will later use (with their name+password) to
  // log in without an email; collisions are astronomically unlikely (33^6
  // possibilities) but retried a few times just in case.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: { name: companyName, loginCode: generateLoginCode() },
        });
        // Every company needs at least one branch to operate (products,
        // sales, etc. all require a concrete branchId) — this one plays the
        // same "Sucursal Principal" role the migration backfilled onto
        // pre-existing companies (see prisma/migrations/20260719160000_add_branches).
        await tx.branch.create({
          data: { companyId: company.id, name: "Sucursal Principal" },
        });
        return tx.user.create({
          data: { email, passwordHash, companyId: company.id, status: "PENDING" },
        });
      });
      return { success: true };
    } catch (err) {
      const isLoginCodeCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("loginCode");
      if (!isLoginCodeCollision) throw err;
    }
  }

  return { success: false, error: "No se pudo crear la empresa, intenta de nuevo" };
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

  const user = await prisma.user.findUnique({
    where: { email },
    include: { company: true },
  });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { success: false, error: genericError };
  }

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

  // The owner/GERENTE account itself has no fixed branch (User.branchId is
  // null for them, see prisma/schema.prisma) — if their company has more
  // than one, they pick which one to enter as before the cookie is set.
  // A submitted branchId is trusted only after confirming it's active and
  // actually belongs to this company.
  const submittedBranchId = formData.get("branchId");
  if (typeof submittedBranchId === "string" && submittedBranchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: submittedBranchId, companyId: user.companyId, isActive: true },
    });
    if (!branch) return { success: false, error: genericError };

    await setSessionCookie({
      uid: user.id,
      cid: user.companyId,
      companyName: user.company.name,
      bid: branch.id,
    });
    redirect("/pos");
  }

  const branches = await prisma.branch.findMany({
    where: { companyId: user.companyId, isActive: true },
    orderBy: { createdAt: "asc" },
  });
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

  const company = await prisma.company.findUnique({
    where: { loginCode: companyCode.toUpperCase() },
  });
  if (!company) {
    return { success: false, error: genericError };
  }

  const user = await prisma.user.findFirst({
    where: {
      companyId: company.id,
      firstName: { equals: firstName, mode: "insensitive" },
      lastName: { equals: lastName, mode: "insensitive" },
    },
  });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { success: false, error: genericError };
  }

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
