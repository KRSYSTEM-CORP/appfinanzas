import Link from "next/link";
import { ExchangeRateForm } from "@/components/settings/ExchangeRateForm";
import { CurrencySelectForm } from "@/components/settings/CurrencySelectForm";
import { ReferenceCurrencyForm } from "@/components/settings/ReferenceCurrencyForm";
import { BrandingForm } from "@/components/settings/BrandingForm";
import { FiscalDataForm } from "@/components/settings/FiscalDataForm";
import { PrintPaperSizeForm } from "@/components/settings/PrintPaperSizeForm";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { BcvRateButton } from "@/components/settings/BcvRateButton";
import { BranchesForm } from "@/components/settings/BranchesForm";
import { IvaSettingsForm } from "@/components/settings/IvaSettingsForm";
import { SettingsTabs, type SettingsSection } from "@/components/settings/SettingsTabs";
import { Separator } from "@/components/ui/separator";
import { getBranding, getExchangeRateInfo, getFiscalData, getIvaSettings } from "@/lib/actions/settings";
import { listBranches } from "@/lib/actions/branches";
import { formatDate } from "@/lib/format";
import { formatLocalCurrency } from "@/lib/currencies";
import { requireSession } from "@/lib/session";
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
  const session = await requireSession();
  const canManage = session.role === "GERENTE" || session.isSuperAdmin;
  const [
    { rate, updatedAt, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize },
    { logoDataUrl, brandColor, brandBackground },
    fiscalData,
    branches,
    ivaSettings,
  ] = await Promise.all([
    getExchangeRateInfo(),
    getBranding(),
    getFiscalData(),
    canManage ? listBranches() : Promise.resolve([]),
    getIvaSettings(),
  ]);
  const stale = isStale(updatedAt);
  const referenceSymbol = referenceCurrency === "USD" ? "$1" : "€1";

  const sections: SettingsSection[] = [
    {
      id: "moneda",
      label: "Moneda y tasa de cambio",
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
              <div className="rounded-lg border p-4 flex flex-col gap-1">
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
      label: "Impresión",
      content: (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 lg:gap-10">
          <p className="text-sm text-muted-foreground">
            Elige el tamaño de papel que usa tu impresora para las notas de entrega, presupuestos y
            recibos de pago.
          </p>
          <PrintPaperSizeForm currentPaperSize={printPaperSize} />
        </div>
      ),
    },
    {
      id: "fiscales",
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
                    Libro de Compras y Ventas
                  </Link>
                  ).
                </p>
                <IvaSettingsForm initial={ivaSettings} />
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

  return (
    <div className="flex flex-col gap-8 p-6">
      {((session.role === "GERENTE" || session.isSuperAdmin) ||
        (!session.isExempt && session.nextPaymentDueDate)) && (
        <div className="flex flex-wrap gap-4">
          {(session.role === "GERENTE" || session.isSuperAdmin) && (
            <div className="rounded-lg border p-4 flex items-center justify-between gap-3 w-full sm:w-auto sm:min-w-sm text-sm">
              <span>Código de empresa y empleados</span>
              <Link href="/employees" className="text-primary underline underline-offset-2 shrink-0">
                Administrar
              </Link>
            </div>
          )}

          {!session.isExempt && session.nextPaymentDueDate && (
            <div className="rounded-lg border p-4 flex items-center justify-between gap-3 w-full sm:w-auto sm:min-w-sm text-sm">
              <span>
                Suscripción mensual vence el{" "}
                <span className="font-medium">{formatDate(session.nextPaymentDueDate)}</span>
              </span>
              <Link href="/billing" className="text-primary underline underline-offset-2 shrink-0">
                Ver detalles
              </Link>
            </div>
          )}
        </div>
      )}

      <SettingsTabs sections={sections} />
    </div>
  );
}
