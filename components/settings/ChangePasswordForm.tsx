"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeMyPassword } from "@/lib/actions/settings";

export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await changeMyPassword(formData);
      if (result.success) {
        setSuccess(true);
        formRef.current?.reset();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-4 max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">Contraseña actual</Label>
        <Input id="currentPassword" name="currentPassword" type="password" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPassword">Nueva contraseña</Label>
        <Input id="newPassword" name="newPassword" type="password" required />
        <p className="text-xs text-muted-foreground">
          Mínimo 8 caracteres, con mayúscula, minúscula y número.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirmar nueva contraseña</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" required />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-success">Contraseña actualizada.</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Cambiar contraseña"}
      </Button>
    </form>
  );
}
