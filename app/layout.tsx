import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavBar } from "@/components/nav/NavBar";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { getSession } from "@/lib/session";
import { getBranding } from "@/lib/actions/settings";
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
    title: session ? `${session.companyName} · KYRA Software` : "KYRA Software",
    description: "Ventas y control de inventario — KYRA Software",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "KYRA Software",
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
  const branding = session ? await getBranding() : { logoDataUrl: null, brandColor: null };

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={branding.brandColor ? ({ "--primary": branding.brandColor } as React.CSSProperties) : undefined}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        {session && (
          <NavBar companyName={session.companyName} logoDataUrl={branding.logoDataUrl} />
        )}
        <main className="flex-1 min-h-0">{children}</main>
      </body>
    </html>
  );
}
