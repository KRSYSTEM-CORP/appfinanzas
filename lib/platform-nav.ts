// Navegación de la Plataforma (superadministrador): grupos y submódulos, cada uno con su ruta
// bajo /admin. Mismo patrón que Administración (lib/admin-nav.ts).

export type PlatformGroupId = "resumen" | "empresas" | "cobros" | "comunicacion" | "aprendizaje" | "auditoria";
export type PlatformSub = { id: string; label: string; href: string };
export type PlatformGroup = {
  id: PlatformGroupId;
  label: string;
  hint: string;
  icon: "chart" | "building" | "money" | "mail" | "learn" | "shield";
  subs: PlatformSub[];
};

export const PLATFORM_GROUPS: PlatformGroup[] = [
  { id: "resumen", label: "Resumen", hint: "Indicadores, alertas y salud", icon: "chart", subs: [{ id: "resumen", label: "Resumen", href: "/admin" }] },
  {
    id: "empresas",
    label: "Empresas",
    hint: "Listado, CRM y uso por plan",
    icon: "building",
    subs: [
      { id: "empresas", label: "Empresas", href: "/admin/empresas" },
      { id: "crm", label: "CRM de empresas", href: "/admin/crm" },
      { id: "uso", label: "Uso y límites", href: "/admin/uso" },
    ],
  },
  {
    id: "cobros",
    label: "Cobros",
    hint: "Aprobaciones, cobranza, pagos y cupones",
    icon: "money",
    subs: [
      { id: "aprobaciones", label: "Aprobaciones", href: "/admin/aprobaciones" },
      { id: "cobranza", label: "Cobranza", href: "/admin/cobranza" },
      { id: "pagos", label: "Pagos de suscripción", href: "/admin/pagos" },
      { id: "cupones", label: "Cupones", href: "/admin/cupones" },
      { id: "dias-gratis", label: "Días gratis", href: "/admin/dias-gratis" },
    ],
  },
  {
    id: "comunicacion",
    label: "Comunicación",
    hint: "Correos masivos y avisos en la app",
    icon: "mail",
    subs: [
      { id: "marketing", label: "Marketing y correos", href: "/admin/marketing" },
      { id: "anuncios", label: "Anuncios en la app", href: "/admin/anuncios" },
    ],
  },
  { id: "aprendizaje", label: "Aprendizaje", hint: "Videos de Learning", icon: "learn", subs: [{ id: "aprendizaje", label: "Videos", href: "/admin/aprendizaje" }] },
  { id: "auditoria", label: "Auditoría", hint: "Registro de acciones y exportes", icon: "shield", subs: [{ id: "auditoria", label: "Auditoría", href: "/admin/auditoria" }] },
];

export function platformGroup(id: PlatformGroupId): PlatformGroup {
  return PLATFORM_GROUPS.find((g) => g.id === id) ?? PLATFORM_GROUPS[0];
}

export function groupOfSub(sub: string): PlatformGroupId {
  return PLATFORM_GROUPS.find((g) => g.subs.some((s) => s.id === sub))?.id ?? "resumen";
}
