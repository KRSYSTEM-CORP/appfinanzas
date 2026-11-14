"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldInput, SCard } from "@/components/settings/team-print-kit";
import { changeMyPassword } from "@/lib/actions/settings";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";

export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [newPassword, setNewPassword] = useState("");
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
        setNewPassword("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <SCard title="Contraseña de tu cuenta" description="Cambia la contraseña de tu propia cuenta">
      <form ref={formRef} action={handleSubmit} className="max-w-sm">
        <Field label="Contraseña actual" htmlFor="currentPassword">
          <FieldInput id="currentPassword" name="currentPassword" type="password" required />
        </Field>
        <Field label="Nueva contraseña" htmlFor="newPassword">
          <FieldInput id="newPassword" name="newPassword" type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
        <div className="mt-2">
          <PasswordRequirements password={newPassword} />
        </div>
        <Field label="Confirmar nueva contraseña" htmlFor="confirmPassword">
          <FieldInput id="confirmPassword" name="confirmPassword" type="password" required />
        </Field>

        {error && <p className="mt-2 text-[13px] text-destructive">{error}</p>}
        {success && <p className="mt-2 text-[13px] text-success">Contraseña actualizada.</p>}

        <div className="mt-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando..." : "Cambiar contraseña"}
          </Button>
        </div>
      </form>
    </SCard>
  );
}
