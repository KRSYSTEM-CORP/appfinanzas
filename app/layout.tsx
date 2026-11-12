import type { Metadata, Viewport } from "next";
import { Geist_Mono, Hanken_Grotesk } from "next/font/google";
import Script from "next/script";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/nav/Sidebar";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { KrPosTour } from "@/components/onboarding/KrPosTour";
import { getSession } from "@/lib/session";
import { RenewalBanner } from "@/components/nav/RenewalBanner";
import { IdleLock } from "@/components/lock/IdleLock";
import { renewalNotice } from "@/lib/renewal";
import { FEATURES, hasFeature } from "@/lib/features";
import { getBranding, getSidebarRate } from "@/lib/actions/settings";
import { getPlan } from "@/lib/plans";
import { listBranches } from "@/lib/actions/branches";
import { deriveBrandVars, deriveDarkAccent } from "@/lib/theme-color";
import "./globals.css";

// Tipografía del rediseño v15: Hanken Grotesk (la de la preview).
const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const session = await getSession();
  return {
    title: session ? `${session.companyName} · KR POS` : "KR POS - By KR System",
    description: "Ventas y control de inventario — KR POS, by KR System",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "KR POS",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#f7f7fb",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const canManage = session ? session.role === "GERENTE" || session.isSuperAdmin : false;
  // Billing-blocked managers must still be able to render /blocked and
  // /billing. listBranches() uses requireSession(), which redirects blocked
  // sessions back to /blocked; calling it from the root layout caused that
  // route to redirect to itself until Next displayed a blank error page.
  // Con la pantalla bloqueada no se carga el menú ni el contenido: solo /lock responde.
  const canLoadAppChrome = Boolean(session && !session.billingBlocked && !session.locked && !session.needsPlanChoice);
  const renewal =
    canLoadAppChrome && session && !session.isSuperAdmin && session.role === "GERENTE" && (session.roleName == null || session.roleName === "Dueño") ? renewalNotice(session.nextPaymentDueDate, session.isExempt) : null;
  const [branding, branches, sidebarRate] = await Promise.all([
    session ? getBranding() : Promise.resolve({ logoDataUrl: null, brandColor: null, brandBackground: null }),
    canManage && canLoadAppChrome ? listBranches() : Promise.resolve([]),
    canLoadAppChrome ? getSidebarRate() : Promise.resolve(null),
  ]);
  // The accent (buttons/links) applies in both themes, but the company's
  // chosen background and the surface colors derived from it only make sense
  // in light mode. As an inline style on <html> they beat the .dark palette,
  // so dark mode used to reach only the sidebar. Scoping them to
  // :root:not(.dark) lets dark mode switch the whole app.
  const toCss = (vars: Record<string, string | undefined>) =>
    Object.entries(vars)
      .map(([name, value]) => `${name}:${value}`)
      .join(";");
  const lightCss = toCss(deriveBrandVars(branding.brandBackground, branding.brandColor));
  const darkCss = toCss(deriveDarkAccent(branding.brandColor));
  const brandCss = [
    lightCss && `html:root:not(.dark){${lightCss}}`,
    darkCss && `html:root.dark{${darkCss}}`,
  ]
    .filter(Boolean)
    .join("");

  return (
    <html
      lang="es"
      className={`${hankenGrotesk.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className={`min-h-full flex flex-col ${canLoadAppChrome ? "md:h-dvh md:flex-row md:overflow-hidden" : ""}`}>
        {brandCss && <style>{brandCss}</style>}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var s=localStorage.getItem('kr-pos-theme');var d=s==='dark';if(d)document.documentElement.classList.add('dark');}catch(e){}})();`}
        </Script>
        <ServiceWorkerRegistration />
        {renewal && <RenewalBanner days={renewal.days} text={renewal.text} />}
        {canLoadAppChrome && session?.hasPin && <IdleLock role={session.role} minutes={session.lockMinutes} />}
        {canLoadAppChrome && session && (
          <Sidebar
            companyName={session.companyName}
            logoDataUrl={branding.logoDataUrl}
            isSuperAdmin={session.isSuperAdmin}
            role={session.role}
            sellerName={session.sellerName}
            allowedSections={session.allowedSections}
            featureLinks={FEATURES.filter((f) => f.href && hasFeature(session.enabledFeatures, f.id)).map((f) => ({
              href: f.href as string,
              label: f.label,
              managerOnly: f.managerOnly ?? false,
            }))}
            branches={branches.map((b) => ({ id: b.id, name: b.name }))}
            currentBranchId={session.branchId}
            currentBranchName={session.branchName}
            hasPin={session.hasPin}
            planLabel={getPlan(session.plan).label}
            planMaxUsers={getPlan(session.plan).maxUsers}
            rateLabel={sidebarRate}
          />
        )}
        {canLoadAppChrome && session && <KrPosTour hasSeenTour={session.hasSeenTour} />}
        <main className={`flex-1 min-w-0 ${canLoadAppChrome ? "md:h-full md:overflow-y-auto max-md:pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] [&>*]:mx-auto [&>*]:w-full [&>*]:max-w-[1120px]" : "min-h-0"}`}>{children}</main>
        <Toaster richColors closeButton position="bottom-right" />
      </body>
    </html>
  );
}
