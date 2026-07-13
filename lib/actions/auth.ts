"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { setSessionCookie, clearSessionCookie } from "@/lib/session";
import { LoginSchema, SignupSchema } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";

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

  const user = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { name: companyName } });
    return tx.user.create({
      data: { email, passwordHash, companyId: company.id },
      include: { company: true },
    });
  });

  await setSessionCookie({
    uid: user.id,
    cid: user.companyId,
    companyName: user.company.name,
  });

  redirect("/pos");
}

export async function login(formData: FormData): Promise<ActionResult> {
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

  await setSessionCookie({
    uid: user.id,
    cid: user.companyId,
    companyName: user.company.name,
  });

  redirect("/pos");
}

export async function logout(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
