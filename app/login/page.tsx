import Image from "next/image";
import { LoginForm } from "@/components/auth/LoginForm";
import { WelcomeModal } from "@/components/auth/WelcomeModal";
import { COPYRIGHT_LINE, WHATSAPP_URL } from "@/lib/legal";
import { getRememberedCompany } from "@/lib/actions/auth";
import { googleOAuthConfigured } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [rememberedCompany, { error }] = await Promise.all([getRememberedCompany(), searchParams]);
  return (
    <div className="flex flex-col gap-6 p-6 py-16 bg-gradient-to-b from-secondary/50 via-background to-background min-h-full">
      <WelcomeModal />
      <div className="text-center flex flex-col items-center gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] p-2 shadow-lg shadow-primary/20">
          <Image src="/icons/icon-512.png" alt="KR POS" width={64} height={64} className="rounded-xl" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Inicia sesión</h1>
          <p className="text-sm text-muted-foreground mt-1">KR POS — Ventas e Inventario</p>
        </div>
      </div>
      <LoginForm rememberedCompany={rememberedCompany} googleConfigured={googleOAuthConfigured()} authError={error} />
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
      <p className="mt-auto pt-10 text-center text-xs text-muted-foreground">{COPYRIGHT_LINE}</p>
    </div>
  );
}
