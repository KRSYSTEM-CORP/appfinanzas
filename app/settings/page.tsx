import Link from "next/link";
import { ExchangeRateForm } from "@/components/settings/ExchangeRateForm";
import { CurrencySelectForm } from "@/components/settings/CurrencySelectForm";
import { ReferenceCurrencyForm } from "@/components/settings/ReferenceCurrencyForm";
import { BrandingForm } from "@/components/settings/BrandingForm";
import { FiscalDataForm } from "@/components/settings/FiscalDataForm";
import { PrintPaperSizeForm } from "@/components/settings/PrintPaperSizeForm";
import { DataPanel } from "@/components/settings/DataPanel";
import { getDailyReportEmails } from "@/lib/actions/data-export";
import { AppInstallGuide } from "@/components/settings/AppInstallGuide";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { BcvRateButton } from "@/components/settings/BcvRateButton";
import { BranchesForm } from "@/components/settings/BranchesForm";
import { IvaSettingsForm } from "@/components/settings/IvaSettingsForm";
import { PaymentAccountsForm } from "@/components/settings/PaymentAccountsForm";
import { listPaymentAccounts } from "@/lib/actions/payment-accounts";
import { PageHeader } from "@/components/shared/PageHeader";
import { SettingsTabs, type SetupStep, type SettingsSection } from "@/components/settings/SettingsTabs";
import { MyPlanPanel } from "@/components/settings/MyPlanPanel";
import { getPlanUsage } from "@/lib/actions/plan";
import { Separator } from "@/components/ui/separator";
import { getBranding, getExchangeRateInfo, getFiscalData, getIvaSettings } from "@/lib/actions/settings";
import { listBranches } from "@/lib/actions/branches";
import { listEmployees } from "@/lib/actions/employees";
import { listRoles } from "@/lib/actions/roles";
import { TeamPinPanel } from "@/components/settings/TeamPinPanel";
import { formatDate } from "@/lib/format";
import { formatLocalCurrency } from "@/lib/currencies";
import { requirePermission } from "@/lib/session";
import { SHOP_TIME_ZONE, zonedDateParts } from "@/lib/report-types";

export const dynamic = "force-dynamic";

function isStale(updatedAt: Date | null): boolean {
  if (!updatedAt) return true;
  const today = zonedDateParts(new Date(), SHOP_TIME_ZONE);
  const updated = zonedDateParts(updatedAt, SHOP_TIME_ZONE);
  return !(
    today.year === updated.year &&
    today.month === updated.month &&
    today.day === updated.day
  );
}

export default async function SettingsPage() {
  const session = await requirePermission("settings");
  // Settings is now fully manager-gated (see requireManager above) — every
  // tab below is reachable, so this is always true. Kept as a named
  // constant rather than deleted since the IVA/Sucursales tabs below still
  // read it and it costs nothing to leave self-documenting.
  const canManage = session.role === "GERENTE" || session.isSuperAdmin;
  const [
    { rate, updatedAt, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize },
    { logoDataUrl, brandColor, brandBackground },
    fiscalData,
    branches,
    ivaSettings,
    paymentAccounts,
    dailyEmails,
    planUsage,
    people,
  ] = await Promise.all([
    getExchangeRateInfo(),
    getBranding(),
    getFiscalData(),
    canManage ? listBranches() : Promise.resolve([]),
    getIvaSettings(),
    canManage ? listPaymentAccounts(false) : Promise.resolve([]),
    canManage ? getDailyReportEmails() : Promise.resolve([] as string[]),
    getPlanUsage(),
    canManage ? listEmployees() : Promise.resolve([]),
  ]);
  const stale = isStale(updatedAt);
  const referenceSymbol = referenceCurrency === "USD" ? "$1" : "€1";

  const roles = await listRoles();
  const managersWithPin = people.filter((p) => p.role === "GERENTE" && p.status === "ACTIVE" && p.hasPin).length;
  const sections: SettingsSection[] = [
    {
      id: "plan",
      label: "Mi plan",
      hint: `Plan ${planUsage.plan.label} · ${planUsage.usedUsers} de ${planUsage.plan.maxUsers} usuarios`,
      content: <MyPlanPanel usage={planUsage} />,
    },
    {
      id: "equipo",
      label: "Equipo y PIN",
      hint: `${people.filter((p) => p.hasPin).length} de ${people.length} con PIN`,
      content: <TeamPinPanel people={people} currentUserId={session.userId} roles={roles} />,
    },
    {
      id: "moneda",
      label: "Moneda y tasa de cambio",
      hint: rate != null ? `Tasa ${rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${referenceCurrency}` : "Sin tasa configurada",
      content: (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4">
            <ReferenceCurrencyForm currentEnabled={exchangeRateEnabled} currentReferenceCurrency={referenceCurrency} />
            {exchangeRateEnabled && (
              <>
                <Separator />
                <CurrencySelectForm currentCurrencyCode={localCurrencyCode} referenceCurrency={referenceCurrency} />
              </>
            )}
          </div>

          {exchangeRateEnabled && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 rounded-[14px] bg-muted p-4">
                <span className="text-sm text-muted-foreground">Tasa actual</span>
                <span className="text-2xl font-semibold">
                  {rate != null ? formatLocalCurrency(rate, localCurrencyCode) : "No configurada"}
                  {rate != null && (
                    <span className="text-sm text-muted-foreground font-normal"> / {referenceSymbol}</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {updatedAt ? `Última actualización: ${formatDate(updatedAt)}` : "Nunca se ha configurado"}
                </span>
              </div>

              {stale && (
                <p className="text-sm text-destructive">
                  {rate != null
                    ? "No has actualizado la tasa hoy. Los precios en tu moneda local pueden estar desactualizados."
                    : "Configura una tasa para poder ver precios en tu moneda local y completar ventas."}
                </p>
              )}

              {localCurrencyCode === "VES" && (
                <p className="text-xs text-muted-foreground -mt-2">
                  Se actualiza sola todos los días con la tasa oficial del BCV. También puedes
                  hacerlo tú mismo, o escribirla a mano abajo.
                </p>
              )}
              {localCurrencyCode === "VES" && <BcvRateButton />}

              <ExchangeRateForm currentRate={rate} currencyCode={localCurrencyCode} referenceCurrency={referenceCurrency} />
            </div>
          )}
        </div>
      ),
    },
    {
      id: "apariencia",
      label: "Apariencia",
      content: (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 lg:gap-10">
          <p className="text-sm text-muted-foreground">
            Sube el logo de tu empresa y elige sus colores. Se aplican en toda la app para ti y
            para tus empleados, y también en la pantalla de inicio de sesión apenas se identifica
            tu empresa (por correo o por código).
          </p>
          <BrandingForm currentLogo={logoDataUrl} currentColor={brandColor} currentBackground={brandBackground} />
        </div>
      ),
    },
    {
      id: "impresion",
      label: "Impresión y Datos",
      content: (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 lg:gap-10">
          <p className="text-sm text-muted-foreground">
            Elige el tamaño de papel que usa tu impresora para las notas de entrega, presupuestos y
            recibos de pago.
          </p>
          <PrintPaperSizeForm currentPaperSize={printPaperSize} />
          {canManage && (
            <div className="lg:col-span-2">
              <DataPanel initialEmails={dailyEmails} />
            </div>
          )}
        </div>
      ),
    },
    {
      id: "aplicacion",
      label: "Instalar app",
      content: <AppInstallGuide />,
    },
    {
      id: "fiscales",
      hint: fiscalData.fiscalRif ? `RIF ${fiscalData.fiscalRif}` : "Aún sin datos fiscales",
      label: "Datos fiscales",
      content: (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 lg:gap-10">
          <p className="text-sm text-muted-foreground">
            Se muestran en las notas de entrega, presupuestos y recibos de pago que generes.
          </p>
          <FiscalDataForm initial={fiscalData} />
        </div>
      ),
    },
    ...(canManage
      ? [
          {
            id: "iva",
            label: "IVA",
            content: (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 lg:gap-10">
                <p className="text-sm text-muted-foreground">
                  Configura las tasas de IVA y si tu empresa debe retener IVA a proveedores (ver{" "}
                  <Link href="/tax-book" className="text-primary underline underline-offset-2">
                    Libro de Contabilidad
                  </Link>
                  ).
                </p>
                <IvaSettingsForm initial={ivaSettings} />
              </div>
            ),
          } satisfies SettingsSection,
          {
            id: "cobros",
            label: "Datos para cobrar",
            content: (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 lg:gap-10">
                <p className="text-sm text-muted-foreground">
                  Tus pagos móviles, cuentas, Zelle o Binance. Aparecen en el punto de venta, con el logo
                  del banco, para que se los des al cliente con un toque.
                </p>
                <PaymentAccountsForm accounts={paymentAccounts} />
              </div>
            ),
          } satisfies SettingsSection,
          {
            id: "sucursales",
            label: "Sucursales",
            content: (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 lg:gap-10">
                <p className="text-sm text-muted-foreground">
                  Cada sucursal tiene su propio catálogo de inventario y su propia caja. Los
                  vendedores entran directo a la suya; tú puedes elegir a cuál entrar o ver todas
                  juntas desde el selector en la barra de navegación.
                </p>
                <BranchesForm branches={branches} />
              </div>
            ),
          } satisfies SettingsSection,
        ]
      : []),
    {
      id: "clave",
      label: "Cambio de clave",
      content: (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 lg:gap-10">
          <p className="text-sm text-muted-foreground">Cambia la contraseña de tu propia cuenta.</p>
          <ChangePasswordForm />
        </div>
      ),
    },
  ];

  const steps: SetupStep[] = [
    { label: "Datos del negocio y RIF", hint: "Nombre, RIF y WhatsApp que verán tus clientes en documentos y presupuestos.", cta: "Completar datos del negocio y RIF", sectionId: "fiscales", done: Boolean(fiscalData.fiscalRif && fiscalData.fiscalLegalName) },
    { label: "Moneda base y tasa", hint: "Elige $ o € y activa la tasa BCV automática.", cta: "Completar moneda base y tasa", sectionId: "moneda", done: !exchangeRateEnabled || (rate != null && !stale) },
    { label: "Métodos de pago", hint: "Carga los datos de Pago Móvil, Zelle, Binance, PayPal y transferencia.", cta: "Completar métodos de pago", sectionId: "cobros", done: paymentAccounts.length > 0 },
    { label: "Equipo y PIN", hint: "Crea tus usuarios y define el PIN de pantalla.", cta: "Completar equipo y pin", sectionId: "equipo", done: managersWithPin > 0 && people.every((p) => p.hasPin) },
    { label: "Impresora y ticket", hint: "Elige ticket 58/80 mm o carta y haz una prueba.", cta: "Completar impresora y ticket", sectionId: "impresion", done: printPaperSize !== "LETTER" },
    { label: "Marca en tus documentos", hint: "Sube tu logo para que tickets, facturas y presupuestos salgan con tu identidad.", cta: "Completar marca en tus documentos", sectionId: "apariencia", done: Boolean(logoDataUrl || brandColor) },
  ];
  const readyPct = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);

  return (
    <div className="flex flex-col gap-8 px-4 py-5">
      <PageHeader eyebrow={session.companyName} title="Ajustes">
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {rate != null && exchangeRateEnabled && (
            <span className="inline-flex items-center rounded-full bg-primary/12 px-2.5 py-[3px] text-xs font-semibold text-primary">
              Tasa {localCurrencyCode === "VES" ? "Bs" : localCurrencyCode} {rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          <span className={`inline-flex items-center rounded-full px-2.5 py-[3px] text-xs font-semibold ${readyPct === 100 ? "bg-success/14 text-success" : "bg-warning/18 text-warning"}`}>
            {readyPct} % listo
          </span>
        </div>
      </PageHeader>

      <SettingsTabs
        sections={sections}
        steps={steps}
      />
    </div>
  );
}
