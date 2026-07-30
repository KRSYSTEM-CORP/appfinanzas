"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signup } from "@/lib/actions/auth";

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await signup(formData);
      if (!result.success) {
        setError(result.error);
      } else {
        setSubmitted(true);
      }
    });
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-3 max-w-sm mx-auto text-center">
        <h2 className="text-lg font-semibold">Cuenta creada</h2>
        <p className="text-sm text-muted-foreground">
          Tu cuenta está pendiente de aprobación por un administrador de KR System. Te
          avisaremos cuando puedas iniciar sesión.
        </p>
        <Link href="/login" className="text-sm text-foreground underline underline-offset-4">
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4 max-w-sm mx-auto">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="companyName">Nombre de la empresa</Label>
        <Input id="companyName" name="companyName" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" minLength={8} required />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending} size="lg">
        {isPending ? "Creando cuenta..." : "Crear cuenta"}
      </Button>

      <p className="text-sm text-muted-foreground text-center">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}
