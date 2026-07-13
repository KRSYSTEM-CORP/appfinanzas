import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6 p-6 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Inicia sesión</h1>
        <p className="text-sm text-muted-foreground mt-1">Mi Tienda — Ventas e Inventario</p>
      </div>
      <LoginForm />
    </div>
  );
}
