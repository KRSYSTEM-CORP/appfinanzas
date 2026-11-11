import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { googleOAuthConfigured } from "@/lib/google-oauth";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; vid?: string; email?: string }>;
}) {
  const { error, vid, email } = await searchParams;
  return (
    <AuthShell footer={<SiteFooter showCopyright={false} />}>
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-[28px] font-bold tracking-tight">Crea tu cuenta</h1>
        <p className="text-sm text-muted-foreground">Regístrate y empieza con 15 días gratis.</p>
      </div>
      <SignupForm
        googleConfigured={googleOAuthConfigured()}
        authError={error}
        initialVerificationId={vid}
        initialEmail={email}
      />
    </AuthShell>
  );
}
