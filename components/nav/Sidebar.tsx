"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3Icon,
  CalculatorIcon,
  ClipboardListIcon,
  EllipsisIcon,
  FileTextIcon,
  GaugeIcon,
  WalletIcon,
  GraduationCapIcon,
  LogOutIcon,
  MenuIcon,
  PackageIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  ShoppingCartIcon,
  SparklesIcon,
  StoreIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";
import { BranchSwitcher } from "@/components/nav/BranchSwitcher";
import { LockButton } from "@/components/lock/LockButton";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { CommandPalette, type PaletteItem } from "@/components/nav/CommandPalette";
import type { Role } from "@prisma/client";

// Color propio de cada módulo (icono en baldosa tintada), igual que el rediseño.
const NAV_TONES: Record<string, string> = {
  "/home": "#433ddd",
  "/pos": "#0f9d9a",
  "/quotes": "#7a3ff2",
  "/inventory": "#ff9f0a",
  "/customers": "#e0409a",
  "/reports": "#d6407f",
  "/documents": "#6655e5",
  "/accounting": "#1d4ed8",
  "/employees": "#0f7a8a",
  "/settings": "#6e6e73",
  "/billing": "#c2410c",
  "/admin": "#1d4ed8",
  "/learning": "#0f7a8a",
  "/assistant": "#6655e5",
  "/branches": "#0f9d9a",
  "/finance": "#0f9d9a",
};

const COLLAPSE_KEY = "kr-pos-sidebar-collapsed";
const ROLE_LABELS: Record<Role, string> = { GERENTE: "Gerente", VENDEDOR: "Vendedor" };

type NavItem = { href: string; label: string; section?: string; icon: React.ComponentType<{ className?: string }> };

// Estructura de la preview v15: tres grupos. Los accesos que no tienen lugar propio
// en la preview (Documentos, Administración de perfiles, Suscripción) siguen
// existiendo: Documentos queda en Control, perfiles y suscripción salen de Ajustes.
// Operación: lo del día a día (los vendedores solo ven lo que su rol permite).
const operationItems: NavItem[] = [
  { href: "/home", label: "Inicio", icon: GaugeIcon },
  { href: "/pos", label: "POS", section: "pos", icon: ShoppingCartIcon },
  { href: "/inventory", label: "Inventario", section: "inventory", icon: PackageIcon },
  { href: "/quotes", label: "Presupuestos", section: "quotes", icon: ClipboardListIcon },
];

// Control: caja, números y administración.
const controlItems: NavItem[] = [
  { href: "/reports", label: "Caja Chica", section: "reports", icon: WalletIcon },
  { href: "/finance", label: "Estadísticas", icon: BarChart3Icon },
  { href: "/customers", label: "Marketing", section: "customers", icon: UsersIcon },
  { href: "/accounting", label: "Administración", icon: CalculatorIcon },
  { href: "/documents", label: "Documentos", section: "documents", icon: FileTextIcon },
];

// Red y plataforma.
const networkItemsBase: NavItem[] = [
  { href: "/branches", label: "Sucursales", icon: StoreIcon },
  { href: "/assistant", label: "Asistente IA", icon: SparklesIcon },
];

// The nav collapses Finanzas/Proveedores/Compras/Libro IVA into one
// "Contabilidad" item, but a user can still land on any of those routes
// directly (e.g. a bookmark) — this keeps it highlighted while on any of
// them, not just on /accounting itself.
const ACCOUNTING_SUBPATHS = ["/accounting", "/suppliers", "/purchases", "/tax-book", "/payroll"];

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
        <span className="px-2.5 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/70">
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
            className={`group/nav flex min-h-11 items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm transition-[background-color,color,box-shadow] duration-150 ease-out ${
              active
                ? "bg-primary/10 font-semibold text-primary"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            } ${collapsed ? "justify-center" : ""}`}
          >
            <span
              style={{ "--mc": NAV_TONES[item.href] ?? "var(--primary)" } as React.CSSProperties}
              className="grid size-8 shrink-0 place-items-center rounded-[11px] bg-[color-mix(in_srgb,var(--mc)_16%,transparent)] text-[var(--mc)] transition-transform duration-150 group-hover/nav:scale-105"
            >
              <Icon className="size-[18px]" />
            </span>
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
  hasPin = false,
  planLabel,
  planMaxUsers,
  rateLabel,
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
  hasPin?: boolean;
  planLabel?: string;
  planMaxUsers?: number;
  rateLabel?: string | null;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
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
  const allowed = (item: NavItem) =>
    canManage || allowedSections.length === 0 || allowedSections.includes(item.section as string);
  // Sin `section` = solo gerente (Inicio, Estadísticas, Administración).
  const visible = (items: NavItem[]) => items.filter((i) => (i.section ? allowed(i) : canManage));

  const opItems = visible(operationItems);
  const controlVisible = visible(controlItems);

  const featureItems: NavItem[] = featureLinks
    .filter((l) => canManage || !l.managerOnly)
    .map((l) => ({ href: l.href, label: l.label, icon: FileTextIcon }));

  const networkItems: NavItem[] = [
    ...(canManage ? networkItemsBase : []),
    { href: "/learning", label: "Learning", icon: GraduationCapIcon },
    ...(canManage ? [{ href: "/settings", label: "Ajustes", icon: SettingsIcon }] : []),
    ...(isSuperAdmin ? [{ href: "/admin", label: "Plataforma", icon: ShieldIcon }] : []),
    ...featureItems,
  ];

  // Barra inferior (teléfono) de la preview: Inicio · Inventario · POS (botón
  // central) · Presupuestos · Más. Un vendedor sin Inicio ve lo que sí puede abrir.
  const tabCandidates: NavItem[] = [
    { href: "/home", label: "Inicio", icon: GaugeIcon },
    { href: "/inventory", label: "Inventario", section: "inventory", icon: PackageIcon },
    { href: "/pos", label: "POS", section: "pos", icon: ShoppingCartIcon },
    { href: "/quotes", label: "Presupuestos", section: "quotes", icon: ClipboardListIcon },
    { href: "/customers", label: "Marketing", section: "customers", icon: UsersIcon },
  ];
  const tabs = tabCandidates.filter((t) => (t.section ? allowed(t) : canManage)).slice(0, 4);

  const paletteItems: PaletteItem[] = [
    ...opItems.map((i) => ({ href: i.href, label: i.label, group: "Operación" })),
    ...controlVisible.map((i) => ({ href: i.href, label: i.label, group: "Control" })),
    ...networkItems.map((i) => ({ href: i.href, label: i.label, group: "Red y plataforma" })),
    ...(canManage
      ? [
          { href: "/employees", label: "Perfiles y PIN", group: "Ajustes" },
          { href: "/billing", label: "Suscripción mensual", group: "Ajustes" },
          { href: "/payroll", label: "Nómina", group: "Control" },
        ]
      : []),
  ];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const branchControl = canManage ? (
    <BranchSwitcher branches={branches} currentBranchId={currentBranchId} />
  ) : (
    currentBranchName && <span className="text-xs text-sidebar-foreground/70 truncate">{currentBranchName}</span>
  );

  const nav = (collapsedRail: boolean, onNavigate: () => void) => (
    <nav className="flex-1 overflow-y-auto px-2.5 py-2 flex flex-col gap-1">
      <NavGroup title="Operación" items={opItems} pathname={pathname} collapsed={collapsedRail} onNavigate={onNavigate} />
      <NavGroup title="Control" items={controlVisible} pathname={pathname} collapsed={collapsedRail} onNavigate={onNavigate} />
      <NavGroup title="Red y plataforma" items={networkItems} pathname={pathname} collapsed={collapsedRail} onNavigate={onNavigate} />
    </nav>
  );

  const brandMark = logoDataUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoDataUrl} alt="" className="size-8 shrink-0 rounded-lg object-cover" />
  ) : (
    // The colored KR POS wordmark, transparent background, in both light and
    // dark mode (its blue-to-pink gradient reads on either surface).
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/wordmark-color-transparent.png" alt="KR POS" className="h-7 w-auto shrink-0" />
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
          {collapsed ? (
            brandMark
          ) : (
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2">
                {/* self-start: opts out of this flex column's default stretch
                    alignment, which some browsers apply to a cross-axis-auto
                    <img> by ignoring its intrinsic aspect ratio and stretching
                    it to the column's full width. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/wordmark-color-transparent.png" alt="KR POS" className="h-5 w-auto shrink-0 self-start" />
                {logoDataUrl && (
                  <>
                    <span className="h-4 w-px bg-sidebar-foreground/15 shrink-0" aria-hidden="true" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoDataUrl}
                      alt=""
                      className="h-5 w-auto max-w-[88px] shrink-0 self-start rounded object-contain"
                    />
                  </>
                )}
              </div>
              <span className="text-xs text-sidebar-foreground/70 truncate max-w-[180px]">{companyName}</span>
            </div>
          )}
        </div>

        {!collapsed && branchControl && (
          <div className="mx-3 mt-3 rounded-xl bg-muted p-2.5">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sede activa</span>
            <div className="mt-1 text-sm font-semibold">{branchControl}</div>
          </div>
        )}

        {nav(collapsed, () => {})}

        <div className={`border-t shrink-0 flex flex-col gap-2 p-3 ${collapsed ? "items-center" : ""}`}>
          {!collapsed && planLabel && (
            <Link
              href="/settings"
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <span>
                Plan {planLabel} · {planMaxUsers} usuarios
              </span>
              {rateLabel && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Tasa {rateLabel}</span>}
            </Link>
          )}
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0 px-0.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground" aria-hidden>
                {sellerName
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-semibold">{sellerName}</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</span>
              </div>
            </div>
          )}
          {/* Acciones del pie en una sola fila de íconos (como la preview). */}
          <div className={`flex items-center gap-1 ${collapsed ? "flex-col" : "justify-between"}`}>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => setPaletteOpen(true)} title="Buscar (Ctrl K)" aria-label="Buscar pantalla">
              <SearchIcon className="size-4" />
            </Button>
            <ThemeToggle collapsed />
            {hasPin && <LockButton collapsed />}
            <form action={logout}>
              <Button type="submit" variant="ghost" size="icon-sm" title="Salir" aria-label="Salir">
                <LogOutIcon className="size-4" />
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={toggleCollapsed}
              title={collapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
              aria-label={collapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
            >
              {collapsed ? <PanelLeftOpenIcon className="size-4" /> : <PanelLeftCloseIcon className="size-4" />}
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile: slim top bar + off-canvas drawer. */}
      <div className="md:hidden sticky top-0 z-40 flex items-center gap-3 border-b glass-bar glass-sidebar text-sidebar-foreground px-4 h-14 shrink-0">
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto"
          aria-label="Buscar pantalla"
          onClick={() => setPaletteOpen(true)}
        >
          <SearchIcon />
        </Button>
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
              {branchControl && (
                <div className="rounded-xl bg-muted p-2.5">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sede activa</span>
                  <div className="mt-1 text-sm font-semibold">{branchControl}</div>
                </div>
              )}
              <div className="flex flex-col leading-tight min-w-0 px-0.5">
                <span className="text-sm font-medium truncate">{sellerName}</span>
                <span className="text-xs text-sidebar-foreground/70">{ROLE_LABELS[role]}</span>
              </div>
              <ThemeToggle />
              {hasPin && <LockButton />}
              <form action={logout}>
                <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
                  Salir
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Phones: five fixed destinations always in reach (the rest lives under
          "Más"). Equal-width columns with icon + label centered in each. */}
      <nav
        aria-label="Navegación principal"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t glass-bar glass-sidebar pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="flex h-[var(--tabbar-h)] items-stretch px-1.5">
          {tabs.map((tab) => {
            const active = isLinkActive(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <li key={tab.href} className={`flex flex-1 items-center justify-center py-1.5 ${tab.href === "/pos" ? "relative" : ""}`}>
                {tab.href === "/pos" ? (
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    aria-label="POS"
                    className="-mt-6 flex flex-col items-center gap-0.5 text-[11px] font-bold text-primary"
                  >
                    <span className="grid size-14 place-items-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-[0_8px_22px_color-mix(in_srgb,var(--primary)_45%,transparent)] transition-transform active:scale-95">
                      <Icon className="size-6" />
                    </span>
                    <span>{tab.label}</span>
                  </Link>
                ) : (
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-full w-full flex-col items-center justify-center gap-1 rounded-2xl text-[11px] leading-none font-medium transition-[transform,background-color,color] duration-150 ease-out active:scale-95 ${
                    active ? "bg-primary/10 text-primary" : "text-sidebar-foreground/65"
                  }`}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="max-w-full truncate px-0.5">{tab.label}</span>
                </Link>
                )}
              </li>
            );
          })}
          <li className="flex flex-1 items-center justify-center py-1.5">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
              className={`flex h-full w-full flex-col items-center justify-center gap-1 rounded-2xl text-[11px] leading-none font-medium transition-[transform,background-color,color] duration-150 ease-out active:scale-95 ${
                mobileOpen ? "bg-primary/10 text-primary" : "text-sidebar-foreground/65"
              }`}
            >
              <EllipsisIcon className="size-5 shrink-0" />
              <span>Más</span>
            </button>
          </li>
        </ul>
      </nav>

      <CommandPalette items={paletteItems} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
