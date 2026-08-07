import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeCodeForProfile } from "@/lib/google-oauth";
import { setSessionCookie } from "@/lib/session";
import { createCompanyWithOwner } from "@/lib/company-provisioning";

// El otro extremo de /api/auth/google/start. Tres casos, en orden:
//
//  1. Ya existe un usuario con este googleId → es alguien que ya entró antes
//     por Google. Se firma sesión.
//  2. Existe un usuario con este correo pero sin googleId → se creó por
//     correo/clave. Se vincula la cuenta de Google a ese mismo usuario en vez
//     de crear un duplicado — es la misma persona con el mismo correo.
//  3. No existe nadie → alta completamente nueva: se crea la empresa, su
//     "Sucursal Principal" y el usuario GERENTE en el mismo gesto, sin pedir
//     contraseña ni nada más. Esto es lo que hace que el registro sea
//     "completamente automatizado" (ver createCompanyWithOwner).

export const dynamic = "force-dynamic";

function redirectWithError(request: NextRequest, error: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  const response = NextResponse.redirect(url);
  response.cookies.delete("google_oauth_state");
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get("google_oauth_state")?.value;

  if (params.get("error")) {
    // El usuario canceló el consentimiento en la pantalla de Google — no es
    // un error del sistema, sólo se vuelve al login sin romper nada.
    return redirectWithError(request, "google_cancelado");
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError(request, "google_estado_invalido");
  }

  let profile: Awaited<ReturnType<typeof exchangeCodeForProfile>>;
  try {
    profile = await exchangeCodeForProfile(code);
  } catch (error) {
    console.error("[google oauth]", error);
    return redirectWithError(request, "google_fallo");
  }

  const byGoogleId = await prisma.user.findUnique({
    where: { googleId: profile.sub },
    include: { company: { select: { name: true } } },
  });

  const target =
    byGoogleId ??
    (await prisma.user.findFirst({
      where: { email: profile.email },
      include: { company: { select: { name: true } } },
    }));

  if (target) {
    if (target.status === "PENDING") return redirectWithError(request, "cuenta_pendiente");
    if (target.status === "SUSPENDED") return redirectWithError(request, "cuenta_suspendida");

    const user = target.googleId
      ? target
      : await prisma.user.update({
          where: { id: target.id },
          data: { googleId: profile.sub },
          include: { company: { select: { name: true } } },
        });

    // The owner/GERENTE account itself has no fixed branch (see
    // prisma/schema.prisma) — with more than one active branch, land on
    // "Todas las sucursales" (bid null) instead of forcing a picker inline
    // here (a Route Handler, unlike login(), can't return a picker UI); the
    // NavBar switcher lets them pick a specific one afterward.
    const branches = await prisma.branch.findMany({
      where: { companyId: user.companyId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    const bid = user.branchId ?? (branches.length === 1 ? branches[0].id : null);

    await setSessionCookie({ uid: user.id, cid: user.companyId, companyName: user.company.name, bid });
    const response = NextResponse.redirect(new URL("/pos", request.url));
    response.cookies.delete("google_oauth_state");
    return response;
  }

  // Alta nueva. El nombre de la empresa se puede cambiar después desde
  // Configuración — lo que importa aquí es no interponer un formulario más
  // entre el clic en "Continuar con Google" y quedar adentro.
  const displayName = profile.name?.trim() || profile.email.split("@")[0];
  const { company, branch, user } = await createCompanyWithOwner(`Negocio de ${displayName}`, {
    email: profile.email,
    googleId: profile.sub,
  });

  await setSessionCookie({ uid: user.id, cid: company.id, companyName: company.name, bid: branch.id });
  const response = NextResponse.redirect(new URL("/pos", request.url));
  response.cookies.delete("google_oauth_state");
  return response;
}
