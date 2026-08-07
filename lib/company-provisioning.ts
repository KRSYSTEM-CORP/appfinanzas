import "server-only";
import { randomInt } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PLATFORM_SETTINGS_ID, TRIAL_DAYS, FALLBACK_MONTHLY_FEE_USD_CENTS } from "@/lib/billing";

// Alta de una empresa nueva con su primera sucursal y su dueño (GERENTE). La
// usan tanto el signup por correo/clave (lib/actions/auth.ts) como el
// callback de Google (app/api/auth/google/callback/route.ts) — es la misma
// empresa con el mismo trial sin importar cómo entró el dueño. El alta es
// autoservicio (sin aprobación de un super admin): el trial de TRIAL_DAYS
// días arranca aquí mismo, no en un paso de aprobación aparte.

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

export type NewOwner = {
  email: string;
  passwordHash?: string;
  googleId?: string;
};

export async function createCompanyWithOwner(companyName: string, owner: NewOwner) {
  const settings = await prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            name: companyName,
            loginCode: generateLoginCode(),
            monthlyFeeUsdCents: settings?.defaultMonthlyFeeUsdCents ?? FALLBACK_MONTHLY_FEE_USD_CENTS,
            nextPaymentDueDate: trialEnd,
          },
        });
        // Every company needs at least one branch to operate (products,
        // sales, etc. all require a concrete branchId).
        const branch = await tx.branch.create({
          data: { companyId: company.id, name: "Sucursal Principal" },
        });
        const user = await tx.user.create({
          data: {
            email: owner.email,
            passwordHash: owner.passwordHash,
            googleId: owner.googleId,
            companyId: company.id,
            status: "ACTIVE",
          },
        });
        return { company, branch, user };
      });
    } catch (err) {
      const isLoginCodeCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("loginCode");
      if (!isLoginCodeCollision) throw err;
    }
  }

  throw new Error("No se pudo crear la empresa, intenta de nuevo");
}
