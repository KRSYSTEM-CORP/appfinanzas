"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3Icon,
  CalculatorIcon,
  ClipboardListIcon,
  CreditCardIcon,
  FileTextIcon,
  LogOutIcon,
  MenuIcon,
  PackageIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SettingsIcon,
  ShieldIcon,
  ShoppingCartIcon,
  UsersIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";
import { BranchSwitcher } from "@/components/nav/BranchSwitcher";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import type { Role } from "@prisma/client";

const COLLAPSE_KEY = "kr-pos-sidebar-collapsed";
const ROLE_LABELS: Record<Role, string> = { GERENTE: "Gerente", VENDEDOR: "Vendedor" };

type NavItem = { href: string; label: string; section?: string; icon: React.ComponentType<{ className?: string }> };

// The day-to-day operational tools — same set every role can reach (see
// requireSectionAccess, lib/session.ts), just grouped under a visible
// heading now instead of an unlabeled row.
const operationItems: NavItem[] = [
  { href: "/pos", label: "Punto de venta", section: "pos", icon: ShoppingCartIcon },
  { href: "/quotes", label: "Presupuestos", section: "quotes", icon: ClipboardListIcon },
  { href: "/inventory", label: "Inventario", section: "inventory", icon: PackageIcon },
  { href: "/customers", label: "Clientes", section: "customers", icon: UsersIcon },
  { href: "/reports", label: "Reportes", section: "reports", icon: BarChart3Icon },
  { href: "/documents", label: "Documentos", section: "documents", icon: FileTextIcon },
];

// GERENTE-only (or a platform super admin, who already sees everything
// else too). Finanzas, Proveedores, Compras and Libro IVA live inside the
// single "Contabilidad" hub (app/accounting) rather than their own items —
// same information architecture as before, just relabeled as a group.
const managementItemsBase: NavItem[] = [
  { href: "/accounting", label: "Contabilidad", icon: CalculatorIcon },
  { href: "/employees", label: "Administración de perfiles", icon: UsersRoundIcon },
];

const companyItemsBase: NavItem[] = [
  { href: "/settings", label: "Configuración", icon: SettingsIcon },
  { href: "/billing", label: "Suscripción mensual", icon: CreditCardIcon },
];

// The nav collapses Finanzas/Proveedores/Compras/Libro IVA into one
// "Contabilidad" item, but a user can still land on any of those routes
// directly (e.g. a bookmark) — this keeps it highlighted while on any of
// them, not just on /accounting itself.
const ACCOUNTING_SUBPATHS = ["/accounting", "/finance", "/suppliers", "/purchases", "/tax-book"];

function isLinkActive(pathname: string, href: string) {
  if (href === "/accounting") {
    return ACCOUNTING_SUBPATHS.some((p) => pathname.startsWith(p));
  }
  return pathname.startsWith(href);
}

function NavGroup({
  title,
  items,
  pathname,
  collapsed,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {!collapsed && (
        <span className="px-2.5 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/45">
          {title}
        </span>
      )}
      {items.map((item) => {
        const active = isLinkActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            } ${collapsed ? "justify-center" : ""}`}
          >
            <Icon className="size-4 shrink-0" />
            <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function Sidebar({
  companyName,
  logoDataUrl,
  isSuperAdmin,
  role,
  sellerName,
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
  sellerName: string;
  allowedSections: string[];
  featureLinks: { href: string; label: string; managerOnly: boolean }[];
  branches: { id: string; name: string }[];
  currentBranchId: string | null;
  currentBranchName: string | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const canManage = role === "GERENTE" || isSuperAdmin;

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Private browsing / blocked storage — default expanded, harmless.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Nothing to persist to — the toggle still works for this visit.
      }
      return next;
    });
  }

  // Empty allowedSections means "unrestricted" (see requireSectionAccess,
  // lib/session.ts) — same rule as before so the nav never hides a link a
  // never-configured VENDEDOR could actually still open.
  const opItems =
    canManage || allowedSections.length === 0
      ? operationItems
      : operationItems.filter((l) => allowedSections.includes(l.section as string));

  const featureItems: NavItem[] = featureLinks
    .filter((l) => canManage || !l.managerOnly)
    .map((l) => ({ href: l.href, label: l.label, icon: FileTextIcon }));

  const managementItems = canManage ? [...managementItemsBase, ...featureItems] : featureItems;
  const companyItems: NavItem[] = [
    ...(isSuperAdmin ? [{ href: "/admin", label: "Administración", icon: ShieldIcon }] : []),
    ...(canManage ? companyItemsBase : []),
  ];

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const branchControl = canManage ? (
    <BranchSwitcher branches={branches} currentBranchId={currentBranchId} />
  ) : (
    currentBranchName && <span className="text-xs text-sidebar-foreground/60 truncate">{currentBranchName}</span>
  );

  const nav = (collapsedRail: boolean, onNavigate: () => void) => (
    <nav className="flex-1 overflow-y-auto px-2.5 py-2 flex flex-col gap-1">
      <NavGroup title="Operación" items={opItems} pathname={pathname} collapsed={collapsedRail} onNavigate={onNavigate} />
      <NavGroup title="Gestión" items={managementItems} pathname={pathname} collapsed={collapsedRail} onNavigate={onNavigate} />
      <NavGroup title="Empresa" items={companyItems} pathname={pathname} collapsed={collapsedRail} onNavigate={onNavigate} />
    </nav>
  );

  const brandMark = logoDataUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoDataUrl} alt="" className="size-8 shrink-0 rounded-lg object-cover" />
  ) : (
    <div className="size-8 shrink-0 rounded-lg bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_25%)] flex items-center justify-center p-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="w-full h-full object-contain" />
    </div>
  );

  return (
    <>
      {/* Desktop: persistent column, collapsible to an icon rail. */}
      <aside
        className={`hidden md:flex md:flex-col shrink-0 border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 ${
          collapsed ? "md:w-16" : "md:w-64"
        }`}
      >
        <div className={`flex items-center gap-2.5 px-3 h-16 border-b shrink-0 ${collapsed ? "justify-center px-2" : ""}`}>
          {brandMark}
          {!collapsed && (
            <div className="flex flex-col leading-none min-w-0">
              <span className="font-semibold text-sm">KR POS</span>
              <span className="text-xs text-sidebar-foreground/60 truncate max-w-[150px]">{companyName}</span>
            </div>
          )}
        </div>

        {nav(collapsed, () => {})}

        <div className={`border-t shrink-0 flex flex-col gap-2 p-3 ${collapsed ? "items-center" : ""}`}>
          {!collapsed && branchControl}
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0 px-0.5">
              <span className="text-sm font-medium truncate">{sellerName}</span>
              <span className="text-xs text-sidebar-foreground/60">{ROLE_LABELS[role]}</span>
            </div>
          )}
          <ThemeToggle collapsed={collapsed} />
          <form action={logout} className={collapsed ? "" : "w-full"}>
            <Button type="submit" variant="ghost" size={collapsed ? "icon-sm" : "sm"} className={collapsed ? "" : "w-full justify-start"} title={collapsed ? "Salir" : undefined} aria-label={collapsed ? "Salir" : undefined}>
              {collapsed ? <LogOutIcon className="size-4" /> : "Salir"}
            </Button>
          </form>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
            className="flex items-center justify-center rounded-lg p-1.5 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors self-stretch"
          >
            {collapsed ? <PanelLeftOpenIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
          </button>
        </div>
      </aside>

      {/* Mobile: slim top bar + off-canvas drawer. */}
      <div className="md:hidden sticky top-0 z-40 flex items-center gap-3 border-b bg-sidebar text-sidebar-foreground px-4 h-14 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <XIcon /> : <MenuIcon />}
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          {brandMark}
          <span className="font-semibold text-sm truncate">{companyName}</span>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative flex flex-col w-72 max-w-[85vw] bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex items-center gap-2.5 px-4 h-14 border-b shrink-0">
              {brandMark}
              <span className="font-semibold text-sm truncate">{companyName}</span>
            </div>
            {nav(false, () => setMobileOpen(false))}
            <div className="border-t shrink-0 flex flex-col gap-2 p-3">
              {branchControl}
              <div className="flex flex-col leading-tight min-w-0 px-0.5">
                <span className="text-sm font-medium truncate">{sellerName}</span>
                <span className="text-xs text-sidebar-foreground/60">{ROLE_LABELS[role]}</span>
              </div>
              <ThemeToggle />
              <form action={logout}>
                <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
                  Salir
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
