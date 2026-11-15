"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrencyCents } from "@/lib/currencies";
import { formatDate, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { resizeImageToDataUrl } from "@/lib/image-utils";
import {
  accruedProvisionCents,
  computeFortnight,
  monthlyProvisionCents,
  payrollSettlement,
  periodLabel,
  shiftPeriod,
  type PayrollRates,
} from "@/lib/payroll";
import { AccountSelect, useSourceAccounts } from "@/components/purchases/AccountSelect";
import { todayDateString } from "@/lib/report-types";
import { buildPayrollReceiptPDF } from "@/lib/payroll-receipt-pdf";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import {
  getPayrollProof,
  payPayroll,
  savePayrollEmployee,
  savePayrollRates,
  type PayrollSeller,
  setPayrollEmployeeActive,
  type PayrollEmployeeRow,
  type PayrollLedgerRow,
  type PayrollPaymentRow,
} from "@/lib/actions/payroll";
import type { PaymentMethod, ReferenceCurrency } from "@prisma/client";

const METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

export function PayrollPanel({
  employees,
  payments,
  currentPeriod,
  referenceCurrency,
  company,
  rates,
  sellers,
  monthsElapsed,
  ledger,
}: {
  ledger: PayrollLedgerRow[];
  sellers: PayrollSeller[];
  rates: PayrollRates;
  monthsElapsed: number;
  company: DeliveryNoteCompany;
  employees: PayrollEmployeeRow[];
  payments: PayrollPaymentRow[];
  currentPeriod: string;
  referenceCurrency: ReferenceCurrency;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PayrollEmployeeRow | "new" | null>(null);
  const [paying, setPaying] = useState<PayrollEmployeeRow | null>(null);
  const [proofView, setProofView] = useState<string | null>(null);
  const money = (c: number) => formatCurrencyCents(referenceCurrency, c);

  const active = employees.filter((e) => e.active);
  const currentLedger = new Map(ledger.filter((r) => r.period === currentPeriod).map((r) => [r.employeeId, r]));
  const pending = active.filter((e) => (currentLedger.get(e.id)?.pendingCents ?? 1) > 0);
  const pendingNet = active.reduce((a, e) => a + (currentLedger.get(e.id)?.pendingCents ?? computeFortnight(e.baseCents, e.foodBonusCents, 0, rates, e.commissionCentsNow).netCents), 0);
  // Saldo total con el personal: lo que se les debe y los adelantos pagados de más.
  const totalOwed = ledger.reduce((a, r) => a + r.pendingCents, 0);
  const totalAdvance = ledger.reduce((a, r) => a + r.surplusCents, 0);
  const provisioned = active.reduce((a, e) => a + accruedProvisionCents(e.baseCents, monthsElapsed), 0);
  const monthlyTotal = active.reduce((a, e) => a + 2 * monthlyProvisionCents(e.baseCents), 0);
  const paidNet = payments.filter((p) => p.period === currentPeriod).reduce((a, p) => a + p.paidCents, 0);

  function toggleActive(e: PayrollEmployeeRow) {
    setError(null);
    startTransition(async () => {
      await setPayrollEmployeeActive(e.id, !e.active);
      router.refresh();
    });
  }

  function downloadReceipt(p: PayrollPaymentRow) {
    startTransition(async () => {
      const doc = await buildPayrollReceiptPDF(p, company, referenceCurrency);
      doc.save(`recibo-nomina-${p.employeeName.replace(/\s+/g, "-").toLowerCase()}-${p.period}.pdf`);
    });
  }

  function viewProof(id: string) {
    startTransition(async () => setProofView(await getPayrollProof(id)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Quincena actual</p>
          <p className="font-semibold">{periodLabel(currentPeriod)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Pendiente por pagar ({pending.length})</p>
          <p className="text-lg font-semibold">{money(pendingNet)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Pagado esta quincena</p>
          <p className="text-lg font-semibold text-success">{money(paidNet)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Saldo con el personal</p>
          <p className={`text-lg font-semibold ${totalOwed > 0 ? "text-destructive" : ""}`}>{totalOwed > 0 ? `Debes ${money(totalOwed)}` : "Al día"}</p>
          {totalAdvance > 0 && <p className="text-xs text-muted-foreground">Adelantos por descontar: {money(totalAdvance)}</p>}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>Empleados</CardTitle>
          <Button size="sm" onClick={() => setEditing("new")}>
            Agregar empleado
          </Button>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay empleados. Agrega el primero para pagar nómina.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {employees.map((e) => {
                const calc = computeFortnight(e.baseCents, e.foodBonusCents, 0, rates, e.commissionCentsNow);
                const row = currentLedger.get(e.id);
                const fullyPaid = row != null && row.paidCents > 0 && row.pendingCents === 0;
                const partial = row != null && row.paidCents > 0 && row.pendingCents > 0;
                return (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-40">
                      <p className={`font-medium ${e.active ? "" : "text-muted-foreground line-through"}`}>{e.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[e.position, e.nationalId].filter(Boolean).join(" · ") || "—"} · Base {money(e.baseCents)}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold tabular-nums">{money(calc.netCents)}</p>
                      <p className="text-xs text-muted-foreground">
                        neto por quincena{e.commissionCentsNow > 0 ? ` (incl. comisión ${money(e.commissionCentsNow)})` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!e.active ? (
                        <Badge variant="secondary">Baja</Badge>
                      ) : (
                        <>
                          {fullyPaid && <Badge variant="secondary">{row.surplusCents > 0 ? `Adelanto ${money(row.surplusCents)}` : "Pagada"}</Badge>}
                          {partial && <Badge variant="outline">Debes {money(row.pendingCents)}</Badge>}
                          <Button size="sm" onClick={() => setPaying(e)}>
                            {partial ? "Abonar" : fullyPaid ? "Otro pago" : "Pagar"}
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setEditing(e)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" disabled={isPending} onClick={() => toggleActive(e)}>
                        {e.active ? "Dar de baja" : "Reactivar"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RatesCard rates={rates} />
        <Card>
          <CardHeader>
            <CardTitle>Provisiones</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p className="text-muted-foreground">
              Lo que ya deberías ir apartando para utilidades y vacaciones ({monthsElapsed} de 12 meses). Cada una acumula
              un mes de sueldo base al año, de ejemplo.
            </p>
            <ProvisionRow label="Utilidades" value={money(provisioned)} />
            <ProvisionRow label="Vacaciones" value={money(provisioned)} />
            <p className="text-xs text-muted-foreground">
              Cada mes suman {money(monthlyTotal)} entre las dos, con {active.length}{" "}
              {active.length === 1 ? "empleado activo" : "empleados activos"}.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saldos por quincena</CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aquí verás, por empleado y quincena, lo devengado, lo pagado y lo que queda debiendo.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">Empleado</th>
                    <th className="py-1 pr-3 font-medium">Quincena</th>
                    <th className="py-1 pr-3 text-right font-medium">Devengado</th>
                    <th className="py-1 pr-3 text-right font-medium">Pagado</th>
                    <th className="py-1 pr-3 text-right font-medium">Adelantos</th>
                    <th className="py-1 text-right font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((r) => (
                    <tr key={`${r.employeeId}-${r.period}`} className="border-t">
                      <td className="py-1.5 pr-3">{r.employeeName}</td>
                      <td className="py-1.5 pr-3">{periodLabel(r.period)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{money(r.owedCents)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{money(r.paidCents)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.advancePaidCents > 0 ? money(r.advancePaidCents) : "—"}</td>
                      <td className="py-1.5 text-right">
                        {r.pendingCents > 0 ? (
                          <Badge variant="destructive">{r.paidCents > 0 ? `Falta ${money(r.pendingCents)}` : `Sin pagar ${money(r.pendingCents)}`}</Badge>
                        ) : r.surplusCents > 0 ? (
                          <Badge variant="outline">Adelanto {money(r.surplusCents)}</Badge>
                        ) : (
                          <Badge variant="secondary">Saldada</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial de pagos</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no se ha registrado ningún pago.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">Fecha</th>
                    <th className="py-1 pr-3 font-medium">Empleado</th>
                    <th className="py-1 pr-3 font-medium">Quincena</th>
                    <th className="py-1 pr-3 font-medium">Tipo</th>
                    <th className="py-1 pr-3 text-right font-medium">Pagado</th>
                    <th className="py-1 pr-3 font-medium">Método</th>
                    <th className="py-1 pr-3 font-medium">Cuenta</th>
                    <th className="py-1 font-medium">Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="py-1.5 pr-3">{formatDate(p.paidAt)}</td>
                      <td className="py-1.5 pr-3">{p.employeeName}</td>
                      <td className="py-1.5 pr-3">{periodLabel(p.period)}</td>
                      <td className="py-1.5 pr-3">{p.isAdvance ? "Adelanto" : p.paidCents >= p.netCents ? "Pago" : "Abono"}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{money(p.paidCents)}</td>
                      <td className="py-1.5 pr-3">{PAYMENT_METHOD_LABELS[p.paymentMethod]}</td>
                      <td className="py-1.5 pr-3">{p.accountLabel ?? "Efectivo de caja"}</td>
                      <td className="py-1.5">
                        {p.reference ?? "—"}
                        <Button size="xs" variant="link" disabled={isPending} onClick={() => downloadReceipt(p)}>
                          Recibo PDF
                        </Button>
                        {p.hasProof && (
                          <Button size="xs" variant="link" onClick={() => viewProof(p.id)}>
                            Ver comprobante
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <EmployeeDialog
          key={editing === "new" ? "new" : editing.id}
          employee={editing === "new" ? null : editing}
          sellers={sellers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {paying && (
        <PayDialog
          employee={paying}
          period={currentPeriod}
          rates={rates}
          payments={payments}
          money={money}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null);
            router.refresh();
          }}
        />
      )}
      <Dialog open={proofView != null} onOpenChange={(o) => !o && setProofView(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comprobante de pago</DialogTitle>
          </DialogHeader>
          {proofView && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proofView} alt="Comprobante de pago" className="max-h-[70vh] w-full rounded-md object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmployeeDialog({
  employee,
  sellers,
  onClose,
  onSaved,
}: {
  employee: PayrollEmployeeRow | null;
  sellers: PayrollSeller[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(employee?.name ?? "");
  const [nationalId, setNationalId] = useState(employee?.nationalId ?? "");
  const [position, setPosition] = useState(employee?.position ?? "");
  const [base, setBase] = useState(employee ? String(employee.baseCents / 100) : "");
  const [food, setFood] = useState(employee ? String(employee.foodBonusCents / 100) : "0");
  const [commission, setCommission] = useState(employee ? String(employee.commissionPct) : "0");
  const [userId, setUserId] = useState(employee?.userId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await savePayrollEmployee(
        {
          name,
          nationalId,
          position,
          baseCents: Math.round(Number(base) * 100),
          foodBonusCents: Math.round(Number(food || "0") * 100),
          commissionPct: Number(commission || "0"),
          userId,
        },
        employee?.id
      );
      if (result.success) onSaved();
      else setError(result.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{employee ? "Editar empleado" : "Agregar empleado"}</DialogTitle>
          <DialogDescription>Sueldo base y bono mensuales en la divisa referencial.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field id="pe-name" label="Nombre completo">
            <Input id="pe-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="pe-ci" label="Cédula (opcional)">
              <Input id="pe-ci" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
            </Field>
            <Field id="pe-pos" label="Cargo (opcional)">
              <Input id="pe-pos" value={position} onChange={(e) => setPosition(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="pe-base" label="Sueldo base mensual">
              <Input id="pe-base" type="number" min="0" step="0.01" inputMode="decimal" value={base} onChange={(e) => setBase(e.target.value)} />
            </Field>
            <Field id="pe-food" label="Bono de alimentación">
              <Input id="pe-food" type="number" min="0" step="0.01" inputMode="decimal" value={food} onChange={(e) => setFood(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="pe-user" label="Vendedor en el sistema (opcional)">
              <select
                id="pe-user"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                <option value="">Sin vendedor</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="pe-comm" label="Comisión (% de sus ventas)">
              <Input id="pe-comm" type="number" min="0" max="100" step="0.1" inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            La comisión es un porcentaje de lo que esa persona vendió en la quincena (sin ventas anuladas). Se suma a sus
            asignaciones; las deducciones de ley se calculan solo sobre el sueldo base.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button disabled={isPending} onClick={save}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({
  employee,
  period: currentPeriod,
  rates,
  payments,
  money,
  onClose,
  onPaid,
}: {
  employee: PayrollEmployeeRow;
  period: string;
  rates: PayrollRates;
  payments: PayrollPaymentRow[];
  money: (c: number) => string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const accounts = useSourceAccounts();
  const [period, setPeriod] = useState(currentPeriod);
  const [paidDate, setPaidDate] = useState(todayDateString());
  const [isAdvance, setIsAdvance] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [accountId, setAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Quincenas que se pueden saldar: la actual, las dos anteriores y la siguiente (adelanto).
  const periods = [shiftPeriod(currentPeriod, -2), shiftPeriod(currentPeriod, -1), currentPeriod, shiftPeriod(currentPeriod, 1)];
  const forPeriod = payments.filter((p) => p.employeeId === employee.id && p.period === period);
  const alreadyPaid = forPeriod.reduce((n, p) => n + p.paidCents, 0);
  // Devengado: lo de la quincena en curso se calcula hoy; el de otra, con el último pago registrado.
  const calc = computeFortnight(employee.baseCents, employee.foodBonusCents, 0, rates, period === currentPeriod ? employee.commissionCentsNow : (forPeriod[0]?.commissionCents ?? 0));
  const owed = period !== currentPeriod && forPeriod[0] ? forPeriod[0].netCents : calc.netCents;
  const before = payrollSettlement(owed, alreadyPaid);
  const [amount, setAmount] = useState(() => (before.pendingCents / 100).toFixed(2));
  const cents = Math.round((parseFloat(amount.replace(",", ".")) || 0) * 100);
  const after = payrollSettlement(owed, alreadyPaid + cents);

  function changePeriod(next: string) {
    setPeriod(next);
    const paid = payments.filter((p) => p.employeeId === employee.id && p.period === next).reduce((n, p) => n + p.paidCents, 0);
    const o = next !== currentPeriod && payments.find((p) => p.employeeId === employee.id && p.period === next)?.netCents;
    const base = typeof o === "number" ? o : computeFortnight(employee.baseCents, employee.foodBonusCents, 0, rates, next === currentPeriod ? employee.commissionCentsNow : 0).netCents;
    setAmount((payrollSettlement(base, paid).pendingCents / 100).toFixed(2));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      setProof(await resizeImageToDataUrl(file, { maxDimension: 1280, format: "image/jpeg", quality: 0.82 }));
    } catch {
      setError("No se pudo leer la imagen del comprobante");
    }
  }

  function pay() {
    setError(null);
    startTransition(async () => {
      const result = await payPayroll({
        employeeId: employee.id,
        period,
        amountCents: cents,
        isAdvance,
        paidDate,
        paymentMethod: method,
        paymentAccountId: accountId || undefined,
        reference,
        note: note || undefined,
        proofDataUrl: proof ?? undefined,
      });
      if (result.success) onPaid();
      else setError(result.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagar a {employee.name}</DialogTitle>
          <DialogDescription>Tú decides cuánto, cuándo y desde qué cuenta. Puedes pagar una parte y el resto después.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field id="pp-period" label="Quincena que se paga">
            <select id="pp-period" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={period} onChange={(e) => changePeriod(e.target.value)}>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {periodLabel(p)}
                  {p === currentPeriod ? " (actual)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <div className="rounded-lg border p-3 text-sm">
            <Row a="Devengado de la quincena (neto)" b={money(owed)} />
            {calc.commissionCents > 0 && period === currentPeriod && <Row a="   incluye comisión por ventas" b={money(calc.commissionCents)} />}
            <Row a="Ya pagado en esta quincena" b={`−${money(alreadyPaid)}`} />
            <Row a={before.advanceCents > 0 ? "Adelanto pagado de más" : "Falta por pagar"} b={money(before.advanceCents > 0 ? before.advanceCents : before.pendingCents)} bold />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="pp-date" label="Fecha del pago">
              <Input id="pp-date" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </Field>
            <Field id="pp-amount" label="Monto a pagar ahora">
              <Input id="pp-amount" type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isAdvance} onChange={(e) => setIsAdvance(e.target.checked)} />
            Es un adelanto (se paga antes de completar la quincena)
          </label>
          <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${after.pendingCents > 0 ? "bg-warning/18 text-warning" : after.advanceCents > 0 ? "bg-primary/10 text-primary" : "bg-success/14 text-success"}`}>
            {cents <= 0
              ? "Escribe el monto que le vas a pagar."
              : after.pendingCents > 0
                ? `Quedará debiéndole ${money(after.pendingCents)} (pago fraccionado).`
                : after.advanceCents > 0
                  ? `Le pagas ${money(after.advanceCents)} de más: queda como adelanto por descontar.`
                  : "Con este pago la quincena queda saldada."}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="pp-method" label="Método de pago">
              <select
                id="pp-method"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="pp-ref" label={method === "CASH" ? "Referencia (opcional)" : "Referencia"}>
              <Input id="pp-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
          <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} label="¿De qué cuenta sale la nómina?" />
          <Field id="pp-note" label="Nota (opcional)">
            <Input id="pp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. primer abono, adelanto por emergencia" />
          </Field>
          <Field id="pp-proof" label="Comprobante (imagen, opcional)">
            <Input id="pp-proof" type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button disabled={isPending || cents <= 0} onClick={pay}>
            Registrar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Row({ a, b, bold }: { a: string; b: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-0.5 ${bold ? "mt-1 border-t pt-1.5 font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{a}</span>
      <span className="tabular-nums">{b}</span>
    </div>
  );
}

function ProvisionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function RatesCard({ rates }: { rates: PayrollRates }) {
  const router = useRouter();
  const [ivss, setIvss] = useState(String(rates.ivssPct));
  const [paro, setParo] = useState(String(rates.paroPct));
  const [faov, setFaov] = useState(String(rates.faovPct));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await savePayrollRates({
        ivssPct: Number(ivss),
        paroPct: Number(paro),
        faovPct: Number(faov),
      });
      if (result.success) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deducciones de ley</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Porcentaje sobre el sueldo base. Cámbialos si la ley vigente es otra; se aplica a los pagos nuevos.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Field id="rt-ivss" label="IVSS (%)">
              <Input id="rt-ivss" type="number" min="0" max="30" step="0.1" inputMode="decimal" value={ivss} onChange={(e) => setIvss(e.target.value)} />
            </Field>
            <Field id="rt-paro" label="Paro forzoso (%)">
              <Input id="rt-paro" type="number" min="0" max="30" step="0.1" inputMode="decimal" value={paro} onChange={(e) => setParo(e.target.value)} />
            </Field>
            <Field id="rt-faov" label="FAOV (%)">
              <Input id="rt-faov" type="number" min="0" max="30" step="0.1" inputMode="decimal" value={faov} onChange={(e) => setFaov(e.target.value)} />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={isPending}>
              Guardar porcentajes
            </Button>
            {saved && <span className="text-sm text-success">Guardado</span>}
            {error && (
              <span role="alert" className="text-sm text-destructive">
                {error}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
