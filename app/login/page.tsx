import Image from "next/image";
import { LoginForm } from "@/components/auth/LoginForm";
import { COPYRIGHT_LINE } from "@/lib/legal";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6 p-6 py-16 bg-gradient-to-b from-secondary/50 via-background to-background min-h-full">
      <div className="text-center flex flex-col items-center gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] p-2 shadow-lg shadow-primary/20">
          <Image src="/icons/icon-512.png" alt="App Finanzas" width={64} height={64} className="rounded-xl" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Inicia sesión</h1>
          <p className="text-sm text-muted-foreground mt-1">App Finanzas — Ventas e Inventario</p>
        </div>
      </div>
      <LoginForm />
      <p className="mt-auto pt-10 text-center text-xs text-muted-foreground">{COPYRIGHT_LINE}</p>
    </div>
  );
}
