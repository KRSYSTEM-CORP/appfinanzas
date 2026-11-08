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
import { computeFortnight, periodLabel } from "@/lib/payroll";
import { buildPayrollReceiptPDF } from "@/lib/payroll-receipt-pdf";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import {
  getPayrollProof,
  payPayroll,
  savePayrollEmployee,
  setPayrollEmployeeActive,
  type PayrollEmployeeRow,
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
}: {
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

  const paidThisPeriod = new Set(payments.filter((p) => p.period === currentPeriod).map((p) => p.employeeId));
  const active = employees.filter((e) => e.active);
  const pending = active.filter((e) => !paidThisPeriod.has(e.id));
  const pendingNet = pending.reduce((a, e) => a + computeFortnight(e.baseCents, e.foodBonusCents).netCents, 0);
  const paidNet = payments.filter((p) => p.period === currentPeriod).reduce((a, p) => a + p.netCents, 0);

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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                const calc = computeFortnight(e.baseCents, e.foodBonusCents);
                const paid = paidThisPeriod.has(e.id);
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
                      <p className="text-xs text-muted-foreground">neto por quincena</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!e.active ? (
                        <Badge variant="secondary">Baja</Badge>
                      ) : paid ? (
                        <Badge variant="secondary">Pagada</Badge>
                      ) : (
                        <Button size="sm" onClick={() => setPaying(e)}>
                          Pagar
                        </Button>
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
          <p className="mt-3 text-xs text-muted-foreground">
            Deducciones de ejemplo sobre el sueldo base: IVSS 4 %, paro forzoso 0,5 % y FAOV 1 %.
          </p>
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
                    <th className="py-1 pr-3 text-right font-medium">Neto</th>
                    <th className="py-1 pr-3 font-medium">Método</th>
                    <th className="py-1 font-medium">Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="py-1.5 pr-3">{formatDate(p.paidAt)}</td>
                      <td className="py-1.5 pr-3">{p.employeeName}</td>
                      <td className="py-1.5 pr-3">{periodLabel(p.period)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{money(p.netCents)}</td>
                      <td className="py-1.5 pr-3">{PAYMENT_METHOD_LABELS[p.paymentMethod]}</td>
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
  onClose,
  onSaved,
}: {
  employee: PayrollEmployeeRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(employee?.name ?? "");
  const [nationalId, setNationalId] = useState(employee?.nationalId ?? "");
  const [position, setPosition] = useState(employee?.position ?? "");
  const [base, setBase] = useState(employee ? String(employee.baseCents / 100) : "");
  const [food, setFood] = useState(employee ? String(employee.foodBonusCents / 100) : "0");
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
  period,
  money,
  onClose,
  onPaid,
}: {
  employee: PayrollEmployeeRow;
  period: string;
  money: (c: number) => string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [advance, setAdvance] = useState("0");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const calc = computeFortnight(employee.baseCents, employee.foodBonusCents, Math.round(Number(advance || "0") * 100));

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
        advanceCents: Math.round(Number(advance || "0") * 100),
        paymentMethod: method,
        reference,
        proofDataUrl: proof ?? undefined,
      });
      if (result.success) onPaid();
      else setError(result.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagar a {employee.name}</DialogTitle>
          <DialogDescription>{periodLabel(period)}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border p-3 text-sm">
            <Row a="Asignaciones" b={money(calc.grossCents)} />
            <Row a="Deducciones" b={`−${money(calc.deductionsCents)}`} />
            <Row a="Adelanto" b={`−${money(calc.advanceCents)}`} />
            <Row a="Neto a pagar" b={money(calc.netCents)} bold />
          </div>
          <Field id="pp-adv" label="Adelanto a descontar">
            <Input id="pp-adv" type="number" min="0" step="0.01" inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value)} />
          </Field>
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
          <Button disabled={isPending} onClick={pay}>
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
