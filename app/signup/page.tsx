import Image from "next/image";
import { SignupForm } from "@/components/auth/SignupForm";
import { WHATSAPP_URL } from "@/lib/legal";
import { googleOAuthConfigured } from "@/lib/google-oauth";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex flex-col gap-6 p-6 py-16">
      <div className="text-center flex flex-col items-center gap-3">
        <Image src="/icons/icon-512.png" alt="KR POS" width={64} height={64} className="rounded-lg" />
        <div>
          <h1 className="text-2xl font-semibold">Crea tu cuenta</h1>
          <p className="text-sm text-muted-foreground mt-1">
            KR POS — regístrate para empezar a usar tu punto de venta e inventario.
          </p>
        </div>
      </div>
      <SignupForm googleConfigured={googleOAuthConfigured()} authError={error} />
      <p className="text-center text-sm text-muted-foreground">
        ¿Quieres este sistema para tu negocio o más información?{" "}
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary hover:underline"
        >
          Escríbenos por WhatsApp
        </a>
      </p>
    </div>
  );
}
