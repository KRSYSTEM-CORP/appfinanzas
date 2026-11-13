import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { googleOAuthConfigured } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; blocked?: string }>;
}) {
  const { error, blocked } = await searchParams;
  return (
    <AuthShell footer={<SiteFooter showCopyright={false} />}>
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-[28px] font-bold tracking-tight">Bienvenido</h1>
        <p className="text-sm text-muted-foreground">Entra a tu negocio</p>
      </div>
      <LoginForm
        googleConfigured={googleOAuthConfigured()}
        authError={error}
        initiallyBlocked={blocked === "suspended"}
      />
    </AuthShell>
  );
}
