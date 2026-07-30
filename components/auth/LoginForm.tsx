"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, loginEmployee, getCompanyBrandingByEmail, getCompanyBrandingByCode, type CompanyBranding } from "@/lib/actions/auth";
import { deriveBrandVars, BRAND_VAR_NAMES } from "@/lib/theme-color";

const NO_BRANDING: CompanyBranding = { logoDataUrl: null, brandColor: null, brandBackground: null };

type BranchOption = { id: string; name: string };

export function LoginForm() {
  const [mode, setMode] = useState<"owner" | "employee">("owner");
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState<CompanyBranding>(NO_BRANDING);
  const [isPending, startTransition] = useTransition();
  // Only ever populated for the owner flow (loginEmployee never needs a
  // picker — an employee's branch is fixed, see lib/actions/auth.ts). Kept
  // alongside the credentials so re-submitting with a chosen branchId
  // doesn't require the user to retype anything.
  const [branchChoices, setBranchChoices] = useState<BranchOption[] | null>(null);
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);

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
            <Input id="email" name="email" type="email" onBlur={handleEmailBlur} required />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="companyCode">Código de empresa</Label>
              <Input id="companyCode" name="companyCode" onBlur={handleCompanyCodeBlur} required />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <Label htmlFor="firstName">Nombre</Label>
                <Input id="firstName" name="firstName" required />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <Label htmlFor="lastName">Apellido</Label>
                <Input id="lastName" name="lastName" required />
              </div>
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
          <Input id="password" name="password" type="password" required />
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
