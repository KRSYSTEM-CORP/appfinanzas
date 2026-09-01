import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant-db";
import { exchangeCodeForProfile } from "@/lib/google-oauth";
import { setSessionCookie } from "@/lib/session";
import { sendSignupCodeEmail } from "@/lib/email";
import { createSignupVerification } from "@/lib/signup-verification";

// El otro extremo de /api/auth/google/start. Tres casos, en orden:
//
//  1. Ya existe un usuario con este googleId → es alguien que ya entró antes
//     por Google. Se firma sesión.
//  2. Existe un usuario con este correo pero sin googleId → se creó por
//     correo/clave. Se vincula la cuenta de Google a ese mismo usuario en vez
//     de crear un duplicado — es la misma persona con el mismo correo.
//  3. No existe nadie → alta completamente nueva: aunque Google ya confirmó
//     el correo, todavía se le pide el mismo código de 6 dígitos que el alta
//     por correo/clave (ver confirmSignupCode en lib/actions/auth.ts) antes
//     de crear la empresa/usuario — misma protección contra bots/spam para
//     ambos caminos de alta, no sólo el manual.

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
  const authCode = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get("google_oauth_state")?.value;

  if (params.get("error")) {
    // El usuario canceló el consentimiento en la pantalla de Google — no es
    // un error del sistema, sólo se vuelve al login sin romper nada.
    return redirectWithError(request, "google_cancelado");
  }
  if (!authCode || !state || !expectedState || state !== expectedState) {
    return redirectWithError(request, "google_estado_invalido");
  }

  let profile: Awaited<ReturnType<typeof exchangeCodeForProfile>>;
  try {
    profile = await exchangeCodeForProfile(authCode);
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
    const branches = await withTenant(user.companyId, (tx) =>
      tx.branch.findMany({
        where: { companyId: user.companyId, isActive: true },
        orderBy: { createdAt: "asc" },
      })
    );
    const bid = user.branchId ?? (branches.length === 1 ? branches[0].id : null);

    await setSessionCookie({ uid: user.id, cid: user.companyId, companyName: user.company.name, bid });
    const response = NextResponse.redirect(new URL("/pos", request.url));
    response.cookies.delete("google_oauth_state");
    return response;
  }

  // Alta nueva. El nombre de la empresa se puede cambiar después desde
  // Configuración. La empresa/usuario todavía no se crean aquí — sólo al
  // confirmar el código (ver confirmSignupCode, lib/actions/auth.ts), igual
  // que el alta por correo/clave.
  const displayName = profile.name?.trim() || profile.email.split("@")[0];
  const payload = { companyName: `Negocio de ${displayName}`, email: profile.email, googleId: profile.sub };
  const { verificationId, code } = await createSignupVerification(profile.email, payload);
  await sendSignupCodeEmail(profile.email, code);

  const response = NextResponse.redirect(
    new URL(`/signup?vid=${verificationId}&email=${encodeURIComponent(profile.email)}`, request.url)
  );
  response.cookies.delete("google_oauth_state");
  return response;
}
