import Image from "next/image";
import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <div className="flex flex-col gap-6 p-6 py-16">
      <div className="text-center flex flex-col items-center gap-3">
        <Image src="/icons/icon-512.png" alt="KYRA Software" width={64} height={64} className="rounded-lg" />
        <div>
          <h1 className="text-2xl font-semibold">Crea tu cuenta</h1>
          <p className="text-sm text-muted-foreground mt-1">
            KYRA Software — regístrate para empezar a usar tu punto de venta e inventario.
          </p>
        </div>
      </div>
      <SignupForm />
    </div>
  );
}
