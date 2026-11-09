import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-[28px] font-bold tracking-tight">Recupera tu contraseña</h1>
        <p className="text-sm text-muted-foreground">
          Ingresa tu correo y te enviamos un enlace para crear una nueva contraseña.
        </p>
      </div>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
