import Image from "next/image";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6 p-6 py-16">
      <div className="text-center flex flex-col items-center gap-3">
        <Image src="/icons/icon-512.png" alt="KYRA Software" width={64} height={64} className="rounded-lg" />
        <div>
          <h1 className="text-2xl font-semibold">Inicia sesión</h1>
          <p className="text-sm text-muted-foreground mt-1">KYRA Software — Ventas e Inventario</p>
        </div>
      </div>
      <LoginForm />
    </div>
  );
}
