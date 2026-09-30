"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, MoreHorizontalIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { logout } from "@/lib/actions/auth";
import { BranchSwitcher } from "@/components/nav/BranchSwitcher";
import type { Role } from "@prisma/client";

const links = [
  { href: "/pos", label: "Punto de venta", section: "pos" as const },
  { href: "/quotes", label: "Presupuestos", section: "quotes" as const },
  { href: "/inventory", label: "Inventario", section: "inventory" as const },
  { href: "/customers", label: "Clientes", section: "customers" as const },
  { href: "/reports", label: "Reportes", section: "reports" as const },
  { href: "/documents", label: "Documentos", section: "documents" as const },
];

// GERENTE-only, same as managerOnlyLinks below — kept as separate named
// constants (rather than merged into that array) so they always render
// last, after Contabilidad/Administración de perfiles, regardless of role.
const settingsLink = { href: "/settings", label: "Configuración" };
const subscriptionLink = { href: "/billing", label: "Suscripción mensual" };

// Only for GERENTE (or a platform super admin, who already sees everything
// else too). Finanzas, Proveedores, Compras and Libro IVA live inside the
// single "Contabilidad" hub (app/accounting) instead of each getting their
// own top-level nav slot, since they're all financial/tax data (cuentas por
// pagar, retenciones, declaración de IVA) rather than day-to-day
// operational tools like Inventario.
const managerOnlyLinks = [
  { href: "/accounting", label: "Contabilidad" },
  { href: "/employees", label: "Administración de perfiles" },
];

// The nav collapses Finanzas/Proveedores/Compras/Libro IVA into one
// "Contabilidad" link, but a user can still land on any of those routes
// directly (e.g. from a bookmark) — this keeps the nav item highlighted
// while on any of them, not just on /accounting itself.
const ACCOUNTING_SUBPATHS = ["/accounting", "/finance", "/suppliers", "/purchases", "/tax-book"];

function isLinkActive(pathname: string, href: string) {
  if (href === "/accounting") {
    return ACCOUNTING_SUBPATHS.some((p) => pathname.startsWith(p));
  }
  return pathname.startsWith(href);
}

export function NavBar({
  companyName,
  logoDataUrl,
  isSuperAdmin,
  role,
  allowedSections,
  featureLinks,
  branches,
  currentBranchId,
  currentBranchName,
}: {
  companyName: string;
  logoDataUrl: string | null;
  isSuperAdmin?: boolean;
  role: Role;
  allowedSections: string[];
  featureLinks: { href: string; label: string; managerOnly: boolean }[];
  branches: { id: string; name: string }[];
  currentBranchId: string | null;
  currentBranchName: string | null;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const canManage = role === "GERENTE" || isSuperAdmin;
  // Empty allowedSections means "unrestricted" (see requireSectionAccess,
  // lib/session.ts) — same rule here so the nav never hides a link a
  // never-configured VENDEDOR could actually still open.
  const primaryLinks =
    canManage || allowedSections.length === 0
      ? links
      : links.filter((l) => allowedSections.includes(l.section));
  // Everything that isn't a day-to-day operational link lives in "Más" —
  // this is what keeps the primary row a fixed, predictable length instead
  // of growing with every role/feature-flag combination and eventually
  // wrapping or truncating the company name (the exact bug this replaces).
  const moreLinks = [
    ...featureLinks.filter((l) => canManage || !l.managerOnly),
    ...(canManage ? managerOnlyLinks : []),
    ...(isSuperAdmin ? [{ href: "/admin", label: "Administración" }] : []),
    ...(canManage ? [settingsLink, subscriptionLink] : []),
  ];
  const moreActive = moreLinks.some((l) => isLinkActive(pathname, l.href));
  const navLinks = [...primaryLinks, ...moreLinks];

  // Close the mobile menu automatically whenever the route actually changes
  // (tapping a link inside it), rather than requiring an explicit close tap.
  useEffect(() => {
    setMenuOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  const branchControl = canManage ? (
    <BranchSwitcher branches={branches} currentBranchId={currentBranchId} />
  ) : (
    currentBranchName && <span className="text-sm text-muted-foreground">{currentBranchName}</span>
  );

  return (
    <nav className="relative border-b bg-card shrink-0">
      <div className="flex items-center gap-3 px-4 md:px-6 h-16">
        <div className="flex items-center gap-2.5 min-w-0">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDataUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_25%)] flex items-center justify-center p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192.png" alt="" className="w-full h-full object-contain" />
            </div>
          )}
          <div className="hidden sm:flex flex-col leading-none min-w-0">
            <span className="font-semibold text-sm">KR POS</span>
            <span className="text-xs text-muted-foreground truncate max-w-[220px]">{companyName}</span>
          </div>
        </div>

        {/* Desktop: a fixed-length primary row (max 6 operational links) plus
            a "Más" popover for everything else — this never overflows or
            truncates, regardless of role or how many custom feature links a
            company has, unlike the old single overflow-x-auto row. */}
        <div className="hidden md:flex items-center gap-1 min-w-0 ml-2">
          {primaryLinks.map((link) => {
            const active = isLinkActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`px-3 py-2 text-sm rounded-lg whitespace-nowrap transition-colors ${
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          {moreLinks.length > 0 && (
            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-current={moreActive ? "page" : undefined}
                    className={`flex items-center gap-1 px-3 py-2 text-sm rounded-lg whitespace-nowrap transition-colors ${
                      moreActive
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    Más
                    <MoreHorizontalIcon className="size-4" />
                  </button>
                }
              />
              <PopoverContent align="start" className="w-64 p-1.5">
                <div className="flex flex-col gap-0.5">
                  {moreLinks.map((link) => {
                    const active = isLinkActive(pathname, link.href);
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        className={`px-2.5 py-2 text-sm rounded-md transition-colors ${
                          active
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-foreground hover:bg-muted"
                        }`}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {branchControl}
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                Salir
              </Button>
            </form>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <XIcon /> : <MenuIcon />}
          </Button>
        </div>
      </div>

      {/* Mobile menu: stacked links with generous tap targets, plus the
          branch control and logout that live inline on desktop. */}
      {menuOpen && (
        <div className="md:hidden absolute inset-x-0 top-16 z-40 flex flex-col gap-1 border-b bg-card p-3 shadow-lg max-h-[calc(100vh-4rem)] overflow-y-auto">
          {navLinks.map((link) => {
            const active = isLinkActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`px-3 py-3 text-sm rounded-lg transition-colors ${
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <div className="mt-2 flex flex-col gap-2 border-t pt-3">
            {branchControl}
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
                Salir
              </Button>
            </form>
          </div>
        </div>
      )}
    </nav>
  );
}
