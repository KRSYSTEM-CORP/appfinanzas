"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";
import { BranchSwitcher } from "@/components/nav/BranchSwitcher";
import type { Role } from "@prisma/client";

const links = [
  { href: "/pos", label: "Punto de venta" },
  { href: "/quotes", label: "Presupuestos" },
  { href: "/inventory", label: "Inventario" },
  { href: "/customers", label: "Clientes" },
  { href: "/reports", label: "Reportes" },
  { href: "/documents", label: "Documentos" },
];

// Always the second-to-last and last items in the nav, regardless of role —
// appended after the manager/super-admin links below, not part of the base
// list, so their position never shifts as role-conditional links come and go.
const settingsLink = { href: "/settings", label: "Configuración" };
const subscriptionLink = { href: "/billing", label: "Suscripción mensual" };

// Finanzas and Administración de perfiles are only for GERENTE (or a
// platform super admin, who already sees everything else too). Proveedores,
// Compras and Libro IVA join them here since they're all financial/tax data
// (cuentas por pagar, retenciones, declaración de IVA), not day-to-day
// operational tools like Inventario.
const managerOnlyLinks = [
  { href: "/finance", label: "Finanzas" },
  { href: "/suppliers", label: "Proveedores" },
  { href: "/purchases", label: "Compras" },
  { href: "/tax-book", label: "Libro IVA" },
  { href: "/employees", label: "Administración de perfiles" },
];

export function NavBar({
  companyName,
  logoDataUrl,
  isSuperAdmin,
  role,
  branches,
  currentBranchId,
  currentBranchName,
}: {
  companyName: string;
  logoDataUrl: string | null;
  isSuperAdmin?: boolean;
  role: Role;
  branches: { id: string; name: string }[];
  currentBranchId: string | null;
  currentBranchName: string | null;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const canManage = role === "GERENTE" || isSuperAdmin;
  const navLinks = [
    ...links,
    ...(canManage ? managerOnlyLinks : []),
    ...(isSuperAdmin ? [{ href: "/admin", label: "Administración" }] : []),
    settingsLink,
    subscriptionLink,
  ];

  // Close the mobile menu automatically whenever the route actually changes
  // (tapping a link inside it), rather than requiring an explicit close tap.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const branchControl = canManage ? (
    <BranchSwitcher branches={branches} currentBranchId={currentBranchId} />
  ) : (
    currentBranchName && <span className="text-sm text-muted-foreground">{currentBranchName}</span>
  );

  return (
    <nav className="relative border-b bg-card shrink-0">
      <div className="flex items-center gap-1 px-4 md:px-6 h-14">
        <div className="flex items-center gap-2 mr-2 md:mr-4 min-w-0">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDataUrl} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground">
              K
            </span>
          )}
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-semibold shrink-0">App Finanzas</span>
            <span className="text-sm text-muted-foreground truncate max-w-[120px] md:max-w-[180px]">
              {companyName}
            </span>
          </div>
        </div>

        {/* Desktop: full link row inline. Hidden below md, where it moves
            into the dropdown panel instead so it never has to squeeze or
            horizontally scroll. */}
        <div className="hidden md:flex items-center gap-1 overflow-x-auto min-w-0">
          {navLinks.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors ${
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
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
        <div className="md:hidden absolute inset-x-0 top-14 z-40 flex flex-col gap-1 border-b bg-card p-3 shadow-lg max-h-[calc(100vh-3.5rem)] overflow-y-auto">
          {navLinks.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2.5 text-sm rounded-md transition-colors ${
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
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
