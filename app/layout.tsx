import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavBar } from "@/components/nav/NavBar";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { KrPosTour } from "@/components/onboarding/KrPosTour";
import { getSession } from "@/lib/session";
import { getBranding } from "@/lib/actions/settings";
import { listBranches } from "@/lib/actions/branches";
import { deriveBrandVars } from "@/lib/theme-color";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
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
  themeColor: "#000000",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  const canManage = session ? session.role === "GERENTE" || session.isSuperAdmin : false;
  const [branding, branches] = await Promise.all([
    session ? getBranding() : Promise.resolve({ logoDataUrl: null, brandColor: null, brandBackground: null }),
    canManage ? listBranches() : Promise.resolve([]),
  ]);
  const brandVars = deriveBrandVars(branding.brandBackground, branding.brandColor);

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={brandVars as React.CSSProperties}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        {session && (
          <NavBar
            companyName={session.companyName}
            logoDataUrl={branding.logoDataUrl}
            isSuperAdmin={session.isSuperAdmin}
            role={session.role}
            allowedSections={session.allowedSections}
            branches={branches.map((b) => ({ id: b.id, name: b.name }))}
            currentBranchId={session.branchId}
            currentBranchName={session.branchName}
          />
        )}
        {session && <KrPosTour hasSeenTour={session.hasSeenTour} />}
        <main className="flex-1 min-h-0">{children}</main>
      </body>
    </html>
  );
}
