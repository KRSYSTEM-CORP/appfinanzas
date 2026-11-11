"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EllipsisIcon, LockIcon, LogOutIcon, SearchIcon, XIcon } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { BranchSwitcher } from "@/components/nav/BranchSwitcher";
import { NavIcon } from "@/components/nav/nav-icons";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import { CommandPalette, type PaletteItem } from "@/components/nav/CommandPalette";
import { lockSession } from "@/lib/actions/pin";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";

const ROLE_LABELS: Record<Role, string> = { GERENTE: "Gerente", VENDEDOR: "Vendedor" };

type NavItem = { key: string; href: string; label: string; section?: string; icon: string; group: "Operación" | "Control" | "Red y plataforma" };

// Los 12 módulos de la preview. Lo que no tiene lugar propio (Documentos, Perfiles y PIN,
// Suscripción mensual, Nómina, Plataforma) sigue existiendo, enlazado desde Administración o
// Ajustes y desde el buscador (Ctrl K).
const MODULES: NavItem[] = [
  { key: "inicio", href: "/home", label: "Inicio", icon: "home", group: "Operación" },
  { key: "pos", href: "/pos", label: "POS", section: "pos", icon: "pos", group: "Operación" },
  { key: "inv", href: "/inventory", label: "Inventario", section: "inventory", icon: "box", group: "Operación" },
  { key: "pre", href: "/quotes/history", label: "Presupuestos", section: "quotes", icon: "book", group: "Operación" },
  { key: "caja", href: "/reports", label: "Caja Chica", section: "reports", icon: "caja", group: "Control" },
  { key: "est", href: "/finance", label: "Estadísticas", icon: "stats", group: "Control" },
  { key: "mkt", href: "/customers", label: "Marketing", section: "customers", icon: "mkt", group: "Control" },
  { key: "adm", href: "/accounting", label: "Administración", icon: "admin", group: "Control" },
  { key: "suc", href: "/branches", label: "Sucursales", icon: "store", group: "Red y plataforma" },
  { key: "ia", href: "/assistant", label: "Asistente IA", icon: "spark", group: "Red y plataforma" },
  { key: "learn", href: "/learning", label: "Learning", icon: "grad", group: "Red y plataforma" },
  { key: "set", href: "/settings", label: "Ajustes", icon: "gear", group: "Red y plataforma" },
];
const GROUPS = ["Operación", "Control", "Red y plataforma"] as const;

// Administración agrupa Compras, Proveedores, Libro IVA y Nómina: sigue resaltada en todas.
const ACCOUNTING_SUBPATHS = ["/accounting", "/suppliers", "/purchases", "/tax-book", "/payroll", "/documents", "/billing", "/employees"];

function isLinkActive(pathname: string, href: string) {
  if (href === "/accounting") return ACCOUNTING_SUBPATHS.some((p) => pathname.startsWith(p));
  if (href === "/quotes/history") return pathname.startsWith("/quotes");
  return pathname.startsWith(href);
}

const color = (key: string) => `var(--m-${key})`;

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
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const canManage = role === "GERENTE" || isSuperAdmin;

  const allowed = (item: NavItem) => canManage || allowedSections.length === 0 || allowedSections.includes(item.section as string);
  // Sin `section` = solo gerente. Learning lo ve todo el equipo.
  const visible = MODULES.filter((i) => (i.key === "learn" ? true : i.section ? allowed(i) : canManage));

  const tabCandidates = ["inicio", "inv", "pos", "pre"];
  const tabs = tabCandidates.map((k) => visible.find((i) => i.key === k)).filter((i): i is NavItem => Boolean(i));

  const paletteItems: PaletteItem[] = [
    ...visible.map((i) => ({ href: i.href, label: i.label, group: i.group })),
    ...(canManage
      ? [
          { href: "/documents", label: "Documentos", group: "Administración" },
          { href: "/employees", label: "Perfiles y PIN", group: "Ajustes" },
          { href: "/billing", label: "Suscripción mensual", group: "Ajustes" },
          { href: "/payroll", label: "Nómina", group: "Administración" },
        ]
      : []),
    ...(isSuperAdmin ? [{ href: "/admin", label: "Plataforma", group: "Plataforma" }] : []),
    ...featureLinks.filter((l) => canManage || !l.managerOnly).map((l) => ({ href: l.href, label: l.label, group: "Más" })),
  ];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (e.key === "Escape") setMoreOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function lock() {
    const r = await lockSession();
    if (r.success) router.replace("/lock");
  }

  const initials = sellerName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const branchControl = canManage ? (
    <BranchSwitcher branches={branches} currentBranchId={currentBranchId} />
  ) : (
    currentBranchName && <b className="truncate text-[15px]">{currentBranchName}</b>
  );

  const pillCls = "flex w-full items-center rounded-full bg-muted px-3.5 py-1.5 text-[13px] font-semibold text-muted-foreground";

  return (
    <>
      {/* Computadora (≥960px): riel lateral de 260px, sin colapsar. */}
      <aside data-kr="side" className="hidden md:flex md:w-[260px] md:shrink-0 md:flex-col md:gap-0.5 md:overflow-y-auto border-r bg-card px-3.5 py-3.5">
        <div className="flex items-center gap-3 px-1.5 pb-2">
          <span data-kr="side-logo" className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-primary font-extrabold tracking-[-0.04em] text-primary-foreground">
            {logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoDataUrl} alt="" className="size-full object-cover" />
            ) : (
              "KR"
            )}
          </span>
          <div className="min-w-0">
            <b className="block text-[17px] tracking-[-0.02em]">KR POS</b>
            <small className="block truncate text-muted-foreground">{companyName}</small>
          </div>
        </div>

        {branchControl && (
          <div data-kr="side-sede" className="mb-1.5 rounded-[14px] bg-muted px-3 py-2.5">
            <small className="block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Sede activa</small>
            <div className="[&_svg]:hidden">{branchControl}</div>
          </div>
        )}

        <nav aria-label="Módulos" className="flex flex-col gap-0.5">
          {GROUPS.map((g) => {
            const items = visible.filter((i) => i.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="flex flex-col gap-0.5">
                <span data-kr="nav-group" className="mx-2 mt-2.5 mb-0.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">
                  {g}
                </span>
                {items.map((item) => {
                  const active = isLinkActive(pathname, item.href);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      data-kr="nav-item"
                      aria-current={active ? "page" : undefined}
                      className="flex min-h-11 w-full items-center gap-3 rounded-[12px] px-3 text-sm font-bold transition-colors duration-150 hover:bg-muted"
                      style={active ? { background: `color-mix(in srgb, ${color(item.key)} 15%, transparent)`, color: color(item.key) } : undefined}
                    >
                      <NavIcon name={item.icon} data-kr="nav-icon" className="size-6 shrink-0" style={{ color: color(item.key) }} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-1.5 px-1.5 pt-2">
          {planLabel && (
            <Link href="/settings" className={pillCls}>
              Plan {planLabel} · {planMaxUsers} usuarios
            </Link>
          )}
          {rateLabel && <span className={`${pillCls} bg-primary/12 text-primary`}>Tasa {rateLabel}</span>}
          {hasPin && (
            <button type="button" onClick={lock} className="flex min-h-9 w-full items-center justify-center gap-2 rounded-full bg-muted text-[13px] font-bold">
              <LockIcon className="size-4" aria-hidden /> Bloquear pantalla
            </button>
          )}
          <div className="flex items-center gap-2.5">
            <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-primary text-[13px] font-extrabold text-primary-foreground" aria-hidden>
              {initials}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <b className="block truncate text-sm">{sellerName}</b>
              <small className="text-muted-foreground">{ROLE_LABELS[role]}</small>
            </div>
            <form action={logout}>
              <button type="submit" title="Salir" aria-label="Salir" className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                <LogOutIcon className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Botón flotante de tema (como en la preview). */}
      <div className="fixed right-3 top-2.5 z-20 md:right-[18px] md:top-3.5 [&_button]:size-10 [&_button]:rounded-full [&_button]:bg-card [&_button]:text-muted-foreground [&_button]:shadow-(--shadow-card)">
        <ThemeToggle collapsed />
      </div>

      {/* Teléfono: barra inferior con POS al centro y hoja «Más». */}
      <nav aria-label="Navegación principal" className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)]">
        <ul className="grid h-[var(--tabbar-h)] grid-cols-5 items-end px-1.5 pb-1.5">
          {tabs.map((tab) => {
            const active = isLinkActive(pathname, tab.href);
            const center = tab.key === "pos";
            return (
              <li key={tab.key} className={center ? "-mt-[22px]" : ""}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 rounded-[14px] px-0.5 py-1.5 text-[11px] font-bold ${active ? "text-primary" : "text-muted-foreground"}`}
                >
                  {center ? (
                    <span data-kr="tab-center" className="grid size-[54px] place-items-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-[0_8px_22px_color-mix(in_srgb,var(--primary)_45%,transparent)]">
                      <NavIcon name={tab.icon} className="size-6 text-white" />
                    </span>
                  ) : (
                    <NavIcon name={tab.icon} className="size-[22px]" />
                  )}
                  <span className="max-w-full truncate">{tab.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="Abrir todos los módulos"
              className={`flex w-full flex-col items-center gap-0.5 rounded-[14px] px-0.5 py-1.5 text-[11px] font-bold ${moreOpen ? "text-primary" : "text-muted-foreground"}`}
            >
              <EllipsisIcon className="size-[22px]" />
              <span>Más</span>
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <>
          <div className="fixed inset-0 z-[60] bg-[rgba(10,14,30,.4)] md:hidden" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Todos los módulos"
            data-kr="sheet"
            className="fixed inset-x-0 bottom-0 z-[61] mx-auto max-h-[88vh] max-w-[560px] overflow-y-auto rounded-t-[24px] bg-card px-4 pt-4 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-(--shadow-float) md:hidden"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-[-0.02em]">Todos los módulos</h2>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Cerrar" className="grid size-9 place-items-center rounded-full bg-muted">
                <XIcon className="size-[18px]" />
              </button>
            </div>
            {branchControl && (
              <div className="mt-3 rounded-[14px] bg-muted px-3 py-2.5">
                <small className="block text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Sede activa</small>
                <div className="[&_svg]:hidden">{branchControl}</div>
              </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2.5">
              {visible.map((item) => {
                const active = isLinkActive(pathname, item.href);
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex flex-col items-center gap-1.5 rounded-[18px] border-2 px-1.5 py-3.5 text-center ${active ? "border-primary bg-primary/12" : "border-transparent bg-muted"}`}
                  >
                    <span className="grid size-[42px] place-items-center rounded-[14px] bg-card" style={{ color: color(item.key) }}>
                      <NavIcon name={item.icon} className="size-[21px]" />
                    </span>
                    <b className="text-[13px] leading-tight">{item.label}</b>
                  </Link>
                );
              })}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <div className="[&_button]:min-h-10 [&_button]:w-full [&_button]:justify-start [&_button]:rounded-full [&_button]:bg-muted [&_button]:px-4 [&_button]:text-[13px] [&_button]:font-bold">
                <ThemeToggle />
              </div>
              <button type="button" onClick={() => { setMoreOpen(false); setPaletteOpen(true); }} className="flex min-h-10 items-center gap-2 rounded-full bg-muted px-4 text-[13px] font-bold">
                <SearchIcon className="size-4" aria-hidden /> Buscar pantalla
              </button>
              {hasPin && (
                <button type="button" onClick={lock} className="flex min-h-10 items-center gap-2 rounded-full bg-muted px-4 text-[13px] font-bold">
                  <LockIcon className="size-4" aria-hidden /> Bloquear pantalla
                </button>
              )}
              <form action={logout}>
                <button type="submit" className="flex min-h-10 w-full items-center gap-2 rounded-full bg-muted px-4 text-[13px] font-bold">
                  <LogOutIcon className="size-4" aria-hidden /> Salir
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      <CommandPalette items={paletteItems} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
