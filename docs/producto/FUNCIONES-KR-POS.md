# Mapa de funciones de KR POS (módulos y reglas de negocio)

Actualizado 2026-11-23. Next.js 16 (App Router) + Prisma + Postgres con RLS por empresa. Todo lo de aquí se verificó leyendo el código de `main` (commit `321f3e15`). Reglas generales del repo: `AGENTS.md` y `PRODUCT.md`. Operación del servidor: `00 ADMINISTRACION/MANUAL-OPERACION-KR-SYSTEM.md`.

Convenciones: las acciones de servidor viven en `lib/actions/*.ts` (`"use server"`), las pantallas en `app/<ruta>/page.tsx`, los componentes en `components/`. Las consultas a la base van por `withTenant` (`lib/tenant-db.ts`) para respetar RLS; nunca `prisma.<modelo>` suelto.

## 1. POS y cobro
- Pantalla: `app/pos/page.tsx`; acciones de venta: `lib/actions/sales.ts`. Estado del catálogo sin internet: `app/pos/offline`.
- **Métodos de pago** (`enum PaymentMethod` en `prisma/schema.prisma`): CASH, CARD (en pantalla «Pago móvil»), TRANSFER, ZELLE, BINANCE, PAYPAL, POS (terminal de tarjeta) y OTHER. Se puede **dividir el pago** en varias líneas (`components/payments/PaymentSplitBuilder.tsx`).
- **Monedas**: bolívares (Bs), dólar ($) y euro (€). Cada línea de pago guarda `currencyCode`, `amountCurrencyCents`, `amountEurCents` (monto en la divisa de referencia) y la tasa usada. La tasa oficial BCV se lee con `lib/bcv-rate.ts` / `bcv-official.ts` y se refresca por cron (`/api/cron/bcv-rate`).
- **Venta a crédito**: `paymentStatus` PAID/CREDIT; la deuda se cobra después con abonos (ver §6). Al cobrarla se guarda la tasa del día del cobro.
- **Vuelto**: se calcula en la pantalla de cobro con el efectivo recibido.
- **IGTF** (`lib/igtf.ts`): porcentaje (3 % por defecto) sobre lo pagado en divisa distinta de la local, solo si la empresa es agente; se cobra **encima** del total, no cambia `totalCents` ni la base del IVA.
- **Anular**: una venta sin factura se anula; con factura se emite nota de crédito (`lib/actions/sales.ts`).
- **Modo sin internet** (`lib/offline/`): `db.ts` (IndexedDB), `use-catalog-sync.ts` (descarga el catálogo), `sync.ts` (sube las ventas pendientes), `pending-receipt.ts`. El catálogo guardado incluye `CatalogSnapshot.paymentAccounts`, así que **también sin internet se elige en qué cuenta se recibió el cobro**.
- **Cuenta receptora**: al cobrar con un método que usa cuenta (pago móvil, transferencia, Zelle, Binance, PayPal, punto de venta) el POS pide la cuenta; se guarda en `SalePayment.paymentAccountId` (ver sección «Cuentas y dinero»).

## 2. Inventario y caché de productos
- Pantalla `app/inventory`, acciones `lib/actions/products.ts` y `transfers.ts` (traspasos entre sucursales).
- **Caché de la lista de productos: 60 s** (`lib/products-cache.ts`, `PRODUCTS_CACHE_TTL_SECONDS`). Claves `products:active|all:<empresa>:<sucursal|all>`. **Todo flujo que cambie existencias debe llamar `invalidateProductsCache(companyId, branchId)`**: venta, anulación, nota de crédito, compra, ajuste y traspaso (hoy lo hacen `lib/actions/sales.ts`, `purchases.ts` y `products.ts`). Si se olvida, «Nueva venta» muestra inventario viejo hasta 60 s. Invalida la sucursal y «todas».

## 3. Compras y órdenes de pago
- `app/purchases` (listado, `new`, `orders`, `import`), `lib/actions/purchases.ts`, proveedores en `app/suppliers` / `lib/actions/suppliers.ts`.
- Una compra puede pagarse al contado o a plazo (`PurchasePaymentStatus`) y los pagos salen de una **cuenta** (descuentan su saldo; ver «Cuentas y dinero»). El selector es el compartido `MethodAndAccount`.

## 4. Gastos
- `app/accounting/gastos`, modelo `Expense` (`amountCents` en moneda de referencia, `localAmountCents` y `enteredInLocal` si se anotó en Bs). Con `paymentAccountId` descuenta de la cuenta (`expenseDebitCents` en `lib/account-balance.ts`).

## 5. Nómina
- `app/payroll`, `lib/actions/payroll.ts`, empleados en `app/employees`. El gerente decide monto, fecha y cuenta de cada pago; se puede pagar por partes o adelantar y el sistema muestra lo que queda debiendo. El pago descuenta de la cuenta (`accountDebitCents`, `payrollDebitCents` en `lib/account-money.ts`).

## 6. Cuentas por cobrar (abonos)
- `app/accounting/receivables` y `app/accounting/cobros`, acciones en `lib/actions/collections.ts`. Los abonos a ventas a crédito suman a la cuenta elegida (mismo selector método + cuenta) y quedan como `SalePayment`.

## 7. Caja Chica por turnos y Corte Z
- Pantalla en `app/reports/page.tsx` con `components/reports/CajaChicaCard.tsx` y `CashClosingPanel.tsx`; lógica en `lib/actions/cash-closing.ts`, `lib/cash-shifts.ts`, `lib/closed-days.ts`. Se abre y se cierra la caja del turno (el cierre cuenta el efectivo); las Estadísticas solo cuentan días con caja cerrada.
- **«Ingresos por método»** (`components/reports/IncomeByMethodDialog.tsx`, `lib/income-by-method.ts`): agrupa lo cobrado en el turno en secciones Puntos de venta, Pago móvil, Transferencias, Zelle, Binance, PayPal, Efectivo y Otros, con filas por cuenta y totales por moneda.
- **Corte Z**: incluye la tabla por método y cuenta. PDF en `lib/cash-closing-pdf.ts`.

## 8. Cuentas Bancarias
Ver la sección «Cuentas y dinero» (abajo). Pantalla `app/accounting/accounts/page.tsx`, componente `components/accounting/BankAccountsView.tsx`.

## 9. Planes, suscripción y prueba
- Planes: `lib/plans.ts` (`PLANS`: topes de usuarios, productos, sucursales, créditos IA, Contabilidad solo Pyme y Corporativo). Emprende: primer mes $9,99, luego $12,99.
- **Prueba de 15 días**: `TRIAL_DAYS = 15` en `lib/billing.ts`. La prueba no tiene fecha propia: es `Company.nextPaymentDueDate` de una empresa que aún no ha pagado nada (`lib/trial.ts`).
- **Bloqueo**: `isCompanyBlocked` (`lib/billing.ts`, `GRACE_DAYS = 0`): pasada la fecha de vencimiento la empresa va a `app/blocked` y debe pagar en `app/billing` (misma pantalla que «Mi plan»). Pagos con mes extra: `monthsCoveredWithBonus` (pagar 12 meses exactos regala 2).
- **Reporte de pago por WhatsApp**: el cliente genera un reporte de pago; hay página `app/pago/[id]/page.tsx` (visor del PDF con «Regresar a KR POS») y API pública `app/api/public/pagos/[id]/route.ts`; el enlace público al PDF va firmado con HMAC (`lib/payment-link.ts`) y el mensaje predeterminado lo arma la pantalla de pago. El equipo aprueba el pago en `/admin/pagos`.
- **Aviso de renovación / prueba** (`lib/renewal.ts`): `RENEWAL_NOTICE_DAYS = 5`; en días calendario de Venezuela (UTC-4). Si la empresa nunca ha pagado el texto habla de «prueba gratis» (hoy, mañana, N días); si no, de renovar el plan. Es solo aviso dentro de la app.
- **Días gratis** (superadmin): módulo `/admin/dias-gratis`, acciones `lib/actions/trial.ts` (`listTrialCompanies`, regalar días), reglas `lib/trial.ts` (atajos +15 d, +1/+2/+3 meses de 30 días, máximo 730; `addFreeDays` suma a lo que quede o desde hoy si ya venció, así una empresa bloqueada vuelve a entrar). Cuenta el total regalado en `Company.freeDaysGranted`.
- **Registro con teléfono obligatorio**: `lib/phone.ts` (`normalizeContactPhone` → `+58412…`, 8 a 15 dígitos, acepta formatos venezolanos) guarda `Company.ownerPhone` (opcional en empresas antiguas).
- **Verificación de Cloudflare (Turnstile)**: solo al entrar (inicio de sesión, empleado, registro, arranque de Google; `lib/turnstile.ts`). Con varias sucursales, `login()` devuelve un permiso firmado de 5 minutos (`lib/branch-ticket.ts`) y `completeBranchLogin()` entra a la sucursal sin repetir la verificación ni la contraseña.
- **Panel de Plataforma `/admin`** (`app/admin/`): anuncios, aprendizaje (videos), aprobaciones, auditoría, cobranza, CRM, cupones (un solo uso), dias-gratis, empresas, export, marketing, pagos, uso. Solo superadmin (`lib/platform-guard.ts`).

## Cuentas y dinero
**Tipos de cuenta** (`enum PaymentAccountKind`): `PAGO_MOVIL`, `TRANSFER`, `ZELLE`, `BINANCE`, `PAYPAL` y `PUNTO_DE_VENTA`. Este último es la **terminal de un banco**: el cobro con tarjeta entra a su cuenta; **no se paga desde ella**. Catálogo de bancos y logos: `lib/payment-accounts.ts`.

**Método → tipo de cuenta** (`lib/payment-method-accounts.ts`, `KIND_BY_METHOD`): CARD→PAGO_MOVIL, TRANSFER→TRANSFER, ZELLE→ZELLE, BINANCE→BINANCE, PAYPAL→PAYPAL, POS→PUNTO_DE_VENTA. Efectivo y Otro no usan cuenta. Si hay cuentas de ese tipo, hay que elegir una (`accountChoiceMessage`).

**Cómo se calcula el saldo** (`lib/account-balance.ts`, `accountBalance`), todo desde `balanceSince`:
`saldo = inicial (openingCents) + cobros recibidos EN la cuenta (SalePayment.paymentAccountId) + cobros antiguos sin cuenta del método vinculado (paymentAccountId null y paymentMethod = linkedMethod) + fondos agregados (AccountFunding) − compras − nómina − gastos`.
Las ventas anuladas no cuentan. Cada línea se convierte a la moneda de la cuenta (`lib/account-money.ts`).

**Verificación de fondos en el servidor**: `assertAccountFunds(tx, companyId, checks)` se llama antes de pagar una compra, nómina o gasto; si el saldo no alcanza lanza `InsufficientFundsError`, que `toActionResult` convierte en `{ code: "INSUFFICIENT_FUNDS", accountId, shortfallCents, accountCurrency }`. La pantalla muestra `components/accounts/InsufficientFundsNotice.tsx` con el botón **«Agregar fondos»** (`AddFundsDialog.tsx`), que crea un `AccountFunding`.

**Selector compartido**: `components/payments/MethodAndAccount.tsx` (mosaicos de método y cuenta, iguales a los del POS) se usa en POS, compras, abonos, gastos y nómina.

**POS y offline**: el POS pide la cuenta receptora; sin internet usa `CatalogSnapshot.paymentAccounts` (`lib/offline/`).

**Caja Chica**: «Ingresos por método» (`lib/income-by-method.ts`, `IncomeByMethodDialog`). **Corte Z**: tabla por método y cuenta.

**Cuentas Bancarias** (`BankAccountsView`): segmentación **«Por caja | Por fecha»** (`lib/actions/accounts-period.ts`, `lib/accounts-segmentation.ts`, componente `components/accounting/AccountsPeriodSection.tsx`): ingresos y egresos por turno de caja o por rango de fechas, con historial exportable a CSV.

**Botón «Ir al banco»**: `lib/bank-sites.ts` (`BANK_SITES`, direcciones oficiales; `normalizeBankSiteUrl` limpia la dirección escrita a mano: solo https) y `lib/open-bank-site.ts`. Los bancos **no se pueden incrustar** (prohíben iframes y no debe pedirse la clave ahí): en la app móvil abre el navegador integrado (plugin `@capacitor/browser`, **pendiente de instalar**) y en la web una ventana aparte con forma de teléfono. **Bicentenario y BOD no tienen dirección por defecto**: la cuenta permite escribir la suya.

**Pendiente conocido**: repartir los cobros antiguos de «Punto de venta» (sin cuenta) entre las terminales nuevas.
