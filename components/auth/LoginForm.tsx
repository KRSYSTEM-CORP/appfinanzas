"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  login,
  loginEmployee,
  getCompanyBrandingByEmail,
  getCompanyBrandingByCode,
  forgetDeviceCompany,
  type CompanyBranding,
  type RememberedCompany,
} from "@/lib/actions/auth";
import { deriveBrandVars, BRAND_VAR_NAMES } from "@/lib/theme-color";
import { splitFullName } from "@/lib/name";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import { Turnstile } from "@/components/auth/Turnstile";

const NO_BRANDING: CompanyBranding = { logoDataUrl: null, brandColor: null, brandBackground: null };

const GOOGLE_ERRORS: Record<string, string> = {
  google_no_configurado: "El inicio de sesión con Google no está configurado todavía.",
  google_cancelado: "Cancelaste el inicio de sesión con Google.",
  google_estado_invalido: "El enlace de Google expiró o no es válido. Intenta de nuevo.",
  google_fallo: "Google no pudo confirmar tu cuenta. Intenta de nuevo.",
  google_turnstile_fallido: "No pudimos verificar que eres humano. Intenta de nuevo.",
  cuenta_pendiente: "Tu cuenta está pendiente de aprobación por un administrador de KR System.",
  cuenta_suspendida: "Tu acceso está suspendido.",
};

type BranchOption = { id: string; name: string };

export function LoginForm({
  rememberedCompany,
  googleConfigured = false,
  authError,
}: {
  rememberedCompany: RememberedCompany | null;
  googleConfigured?: boolean;
  authError?: string;
}) {
  const [mode, setMode] = useState<"owner" | "employee">("owner");
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState<CompanyBranding>(NO_BRANDING);
  const [isPending, startTransition] = useTransition();
  // Whether we're still trusting the device's remembered company code —
  // starts true whenever one exists, so a returning employee skips typing
  // it; "Usar otro código" below flips this off for the rest of the session.
  const [useRemembered, setUseRemembered] = useState(!!rememberedCompany);
  // Only ever populated for the owner flow (loginEmployee never needs a
  // picker — an employee's branch is fixed, see lib/actions/auth.ts). Kept
  // alongside the credentials so re-submitting with a chosen branchId
  // doesn't require the user to retype anything.
  const [branchChoices, setBranchChoices] = useState<BranchOption[] | null>(null);
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");

  // Preview the remembered company's branding right away, same as if the
  // employee had just typed its code themselves.
  useEffect(() => {
    if (!rememberedCompany || !useRemembered) return;
    let cancelled = false;
    getCompanyBrandingByCode(rememberedCompany.code)
      .then((b) => {
        if (!cancelled) setBranding(b);
      })
      .catch(() => {
        if (!cancelled) setBranding(NO_BRANDING);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-preview a company's own colors/logo on the login screen itself, as
  // soon as it's identified (by email for owners, by company code for
  // employees) — before the visitor has actually authenticated.
  useEffect(() => {
    const vars = deriveBrandVars(branding.brandBackground, branding.brandColor);
    const root = document.documentElement.style;
    for (const name of BRAND_VAR_NAMES) {
      if (vars[name]) root.setProperty(name, vars[name]);
      else root.removeProperty(name);
    }
    return () => {
      for (const name of BRAND_VAR_NAMES) root.removeProperty(name);
    };
  }, [branding]);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      if (mode === "employee") {
        // A single "nombre y apellido" input reads as one username field to
        // a password manager (two side-by-side inputs don't) — split it back
        // into what loginEmployee() actually expects server-side.
        const { firstName, lastName } = splitFullName(String(formData.get("fullName") ?? ""));
        formData.set("firstName", firstName);
        formData.set("lastName", lastName);
        const result = await loginEmployee(formData);
        if (!result.success) setError(result.error);
        return;
      }

      const result = await login(formData);
      if (result.success) return;
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPendingCredentials({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      });
      setBranchChoices(result.branches);
    });
  }

  function handleBranchPick(branchId: string) {
    if (!pendingCredentials) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("email", pendingCredentials.email);
      formData.set("password", pendingCredentials.password);
      formData.set("branchId", branchId);
      const result = await login(formData);
      if (!result.success && "error" in result) setError(result.error);
    });
  }

  async function handleEmailBlur(e: React.FocusEvent<HTMLInputElement>) {
    const email = e.target.value;
    if (!email) {
      setBranding(NO_BRANDING);
      return;
    }
    try {
      setBranding(await getCompanyBrandingByEmail(email));
    } catch {
      setBranding(NO_BRANDING);
    }
  }

  function handleGoogleClick() {
    if (!turnstileToken && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
      setError("Resuelve la verificación de seguridad para continuar.");
      return;
    }
    const url = new URL("/api/auth/google/start", window.location.origin);
    url.searchParams.set("from", "login");
    if (turnstileToken) url.searchParams.set("token", turnstileToken);
    window.location.href = url.toString();
  }

  async function handleCompanyCodeBlur(e: React.FocusEvent<HTMLInputElement>) {
    const code = e.target.value;
    if (!code) {
      setBranding(NO_BRANDING);
      return;
    }
    try {
      setBranding(await getCompanyBrandingByCode(code));
    } catch {
      setBranding(NO_BRANDING);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-sm mx-auto">
      <div className="flex gap-1 rounded-lg border p-1 mx-auto">
        <button
          type="button"
          onClick={() => {
            setMode("owner");
            setError(null);
            setBranding(NO_BRANDING);
            setBranchChoices(null);
            setPendingCredentials(null);
          }}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            mode === "owner" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          Soy administrador
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("employee");
            setError(null);
            setBranding(NO_BRANDING);
            if (rememberedCompany && useRemembered) {
              getCompanyBrandingByCode(rememberedCompany.code).then(setBranding).catch(() => {});
            }
            setBranchChoices(null);
            setPendingCredentials(null);
          }}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            mode === "employee" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          Soy empleado
        </button>
      </div>

      {authError && GOOGLE_ERRORS[authError] && (
        <p className="text-sm text-destructive text-center">{GOOGLE_ERRORS[authError]}</p>
      )}

      {mode === "owner" && googleConfigured && !branchChoices && (
        <>
          <Turnstile onVerify={setTurnstileToken} />
          <button
            type="button"
            onClick={handleGoogleClick}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <GoogleIcon />
            Continuar con Google
          </button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />o<div className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      {branchChoices ? (
        <div className="flex flex-col gap-4">
          {branding.logoDataUrl && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={branding.logoDataUrl} alt="" className="h-16 w-16 rounded object-cover" />
            </div>
          )}

          <p className="text-sm text-muted-foreground text-center">Elige tu sucursal</p>

          <div className="flex flex-col gap-2">
            {branchChoices.map((branch) => (
              <Button
                key={branch.id}
                type="button"
                variant="outline"
                size="lg"
                disabled={isPending}
                onClick={() => handleBranchPick(branch.id)}
              >
                {branch.name}
              </Button>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => {
              setError(null);
              setBranchChoices(null);
              setPendingCredentials(null);
            }}
          >
            Volver
          </button>
        </div>
      ) : (
      <form action={handleSubmit} className="flex flex-col gap-4">
        {branding.logoDataUrl && (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={branding.logoDataUrl} alt="" className="h-16 w-16 rounded object-cover" />
          </div>
        )}

        {mode === "owner" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              onBlur={handleEmailBlur}
              required
            />
          </div>
        ) : rememberedCompany && useRemembered ? (
          <>
            <input type="hidden" name="companyCode" value={rememberedCompany.code} />
            <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                Negocio: <span className="text-foreground font-medium">{rememberedCompany.companyName ?? "recordado en este dispositivo"}</span>
              </span>
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-4 shrink-0"
                onClick={() => {
                  setUseRemembered(false);
                  setBranding(NO_BRANDING);
                  forgetDeviceCompany().catch(() => {});
                }}
              >
                Usar otro código
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fullName">Nombre de usuario</Label>
              <Input id="fullName" name="fullName" autoComplete="username" required />
              <p className="text-xs text-muted-foreground">Escribe nombre y apellido</p>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="companyCode">Código de empresa</Label>
              <Input id="companyCode" name="companyCode" onBlur={handleCompanyCodeBlur} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fullName">Nombre de usuario</Label>
              <Input id="fullName" name="fullName" autoComplete="username" required />
              <p className="text-xs text-muted-foreground">Escribe nombre y apellido</p>
            </div>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            {mode === "owner" && (
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground underline underline-offset-4"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            )}
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" disabled={isPending} size="lg">
          {isPending ? "Entrando..." : "Iniciar sesión"}
        </Button>

        {mode === "owner" && (
          <p className="text-sm text-muted-foreground text-center">
            ¿No tienes cuenta?{" "}
            <Link href="/signup" className="text-foreground underline underline-offset-4">
              Crea una
            </Link>
          </p>
        )}
      </form>
      )}
    </div>
  );
}
