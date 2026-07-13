import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <div className="flex flex-col gap-6 p-6 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Crea tu cuenta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          KYRA Software — regístrate para empezar a usar tu punto de venta e inventario.
        </p>
      </div>
      <SignupForm />
    </div>
  );
}
