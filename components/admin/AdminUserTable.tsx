"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Company, Role, User, UserStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { isCompanyBlocked } from "@/lib/billing";
import {
  approveUser,
  denyUser,
  suspendUser,
  reactivateUser,
  recordMaintenancePayment,
  setCompanyExempt,
  deleteCompany,
} from "@/lib/actions/admin";

const STATUS_LABELS: Record<UserStatus, string> = {
  PENDING: "Pendiente",
  ACTIVE: "Activo",
  SUSPENDED: "Suspendido",
};

const ROLE_LABELS: Record<Role, string> = {
  GERENTE: "Gerente",
  VENDEDOR: "Vendedor",
};

function displayName(u: Pick<User, "firstName" | "lastName" | "email">): string {
  return u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email;
}

type AdminCompany = Company & { users: User[] };

function addDaysISO(from: Date, days: number): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function AdminUserTable({
  companies,
  currentUserId,
}: {
  companies: AdminCompany[];
  currentUserId: string;
}) {
  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Correo</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Cobro</TableHead>
            <TableHead>Registrado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((c) => (
            <AdminCompanyRow key={c.id} company={c} currentUserId={currentUserId} />
          ))}
          {companies.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No hay empresas registradas todavía.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function AdminCompanyRow({
  company,
  currentUserId,
}: {
  company: AdminCompany;
  currentUserId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  const owner = company.users[0];
  const employees = company.users.slice(1);

  const [feeUsd, setFeeUsd] = useState("");
  const [approveDueDate, setApproveDueDate] = useState(() => addDaysISO(new Date(), 30));
  const [approveError, setApproveError] = useState<string | null>(null);

  const [payAmount, setPayAmount] = useState(
    company.monthlyFeeUsdCents != null ? String(company.monthlyFeeUsdCents / 100) : ""
  );
  const [payPeriodEnd, setPayPeriodEnd] = useState(() =>
    addDaysISO(company.nextPaymentDueDate ?? new Date(), 30)
  );
  const [payNote, setPayNote] = useState("");
  const [payError, setPayError] = useState<string | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!owner) return null;

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  function handleApprove(e: React.MouseEvent) {
    e.preventDefault();
    setApproveError(null);
    startTransition(async () => {
      const result = await approveUser(owner.id, {
        monthlyFee: feeUsd,
        nextPaymentDueDate: approveDueDate,
      });
      if (!result.success) {
        setApproveError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleRecordPayment(e: React.MouseEvent) {
    e.preventDefault();
    setPayError(null);
    startTransition(async () => {
      const result = await recordMaintenancePayment(company.id, {
        amount: payAmount,
        periodEnd: payPeriodEnd,
        note: payNote,
      });
      if (!result.success) {
        setPayError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDeleteCompany(e: React.MouseEvent) {
    e.preventDefault();
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteCompany(company.id);
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const blocked = isCompanyBlocked({
    isExempt: company.isExempt,
    nextPaymentDueDate: company.nextPaymentDueDate,
  });

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-left hover:underline underline-offset-2"
          >
            <span className="text-muted-foreground">{expanded ? "▾" : "▸"}</span>
            {company.name}
            {employees.length > 0 && (
              <Badge variant="outline" className="ml-1">
                {employees.length} {employees.length === 1 ? "empleado" : "empleados"}
              </Badge>
            )}
          </button>
        </TableCell>
        <TableCell>
          {owner.email}
          {owner.isSuperAdmin && (
            <Badge variant="outline" className="ml-2">
              Admin
            </Badge>
          )}
        </TableCell>
        <TableCell>
          <Badge
            variant={
              owner.status === "ACTIVE" ? "success" : owner.status === "PENDING" ? "outline" : "destructive"
            }
          >
            {STATUS_LABELS[owner.status]}
          </Badge>
        </TableCell>
        <TableCell>
          {company.isExempt ? (
            <Badge variant="outline">Exonerada</Badge>
          ) : blocked ? (
            <Badge variant="destructive">Bloqueada por pago</Badge>
          ) : company.nextPaymentDueDate ? (
            <Badge variant="outline">Vence el {formatDate(company.nextPaymentDueDate)}</Badge>
          ) : (
            <Badge variant="outline">Sin ciclo configurado</Badge>
          )}
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">{formatDate(company.createdAt)}</TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end flex-wrap gap-2">
            {owner.status === "PENDING" && (
              <>
                <Dialog>
                  <DialogTrigger render={<Button size="sm" disabled={isPending} />}>
                    Aprobar
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Aprobar a {company.name}</DialogTitle>
                      <DialogDescription>
                        Define el ciclo de cobro de suscripción mensual. La activación se cobra por
                        fuera de la app; esto solo configura la suscripción mensual recurrente.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`fee-${owner.id}`}>Monto mensual (USD)</Label>
                        <Input
                          id={`fee-${owner.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={feeUsd}
                          onChange={(e) => setFeeUsd(e.target.value)}
                          placeholder="Ej. 25.00"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`due-${owner.id}`}>Primera fecha de vencimiento</Label>
                        <Input
                          id={`due-${owner.id}`}
                          type="date"
                          value={approveDueDate}
                          onChange={(e) => setApproveDueDate(e.target.value)}
                        />
                      </div>
                      {approveError && <p className="text-sm text-destructive">{approveError}</p>}
                    </div>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                      <DialogClose render={<Button disabled={isPending} />} onClick={handleApprove}>
                        Aprobar y activar
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Dialog>
                  <DialogTrigger
                    render={<Button size="sm" variant="outline" disabled={isPending} />}
                  >
                    Denegar
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>¿Denegar el acceso a {company.name}?</DialogTitle>
                      <DialogDescription>
                        El usuario {owner.email} no podrá iniciar sesión. Podrás reactivarlo más
                        adelante si cambias de opinión.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                      <DialogClose
                        render={<Button variant="destructive" disabled={isPending} />}
                        onClick={() => run(() => denyUser(owner.id))}
                      >
                        Denegar
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
            {owner.status === "ACTIVE" && !company.isExempt && (
              <Dialog>
                <DialogTrigger render={<Button size="sm" variant="outline" disabled={isPending} />}>
                  Registrar pago
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Registrar pago de suscripción — {company.name}</DialogTitle>
                    <DialogDescription>
                      Confirma el pago recibido. Esto actualiza el monto vigente y desbloquea
                      la cuenta si estaba vencida.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`pay-amount-${owner.id}`}>Monto (USD)</Label>
                      <Input
                        id={`pay-amount-${owner.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`pay-period-${owner.id}`}>Nueva fecha de vencimiento</Label>
                      <Input
                        id={`pay-period-${owner.id}`}
                        type="date"
                        value={payPeriodEnd}
                        onChange={(e) => setPayPeriodEnd(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`pay-note-${owner.id}`}>Nota (opcional)</Label>
                      <Input
                        id={`pay-note-${owner.id}`}
                        value={payNote}
                        onChange={(e) => setPayNote(e.target.value)}
                        placeholder="Ej. Pago Móvil ref. 001234567"
                      />
                    </div>
                    {payError && <p className="text-sm text-destructive">{payError}</p>}
                  </div>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                    <DialogClose
                      render={<Button disabled={isPending} />}
                      onClick={handleRecordPayment}
                    >
                      Registrar pago
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {(owner.status === "ACTIVE" || owner.status === "PENDING") && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => run(() => setCompanyExempt(company.id, !company.isExempt))}
              >
                {company.isExempt ? "Quitar exoneración" : "Exonerar"}
              </Button>
            )}
            {owner.status === "ACTIVE" && owner.id !== currentUserId && (
              <Dialog>
                <DialogTrigger render={<Button size="sm" variant="destructive" disabled={isPending} />}>
                  Suspender
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>¿Suspender el acceso de {company.name}?</DialogTitle>
                    <DialogDescription>
                      El usuario {owner.email} dejará de poder iniciar sesión de inmediato. Podrás
                      reactivarlo cuando quieras.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                    <DialogClose
                      render={<Button variant="destructive" disabled={isPending} />}
                      onClick={() => run(() => suspendUser(owner.id))}
                    >
                      Suspender
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {owner.status === "SUSPENDED" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => run(() => reactivateUser(owner.id))}
                >
                  Reactivar
                </Button>
                <Dialog>
                  <DialogTrigger render={<Button size="sm" variant="destructive" disabled={isPending} />}>
                    Eliminar
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>¿Eliminar permanentemente a {company.name}?</DialogTitle>
                      <DialogDescription>
                        Esta acción es irreversible. Se borrarán todos sus datos: productos,
                        clientes, ventas, presupuestos y pagos registrados. No se puede deshacer.
                      </DialogDescription>
                    </DialogHeader>
                    {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                      <DialogClose
                        render={<Button variant="destructive" disabled={isPending} />}
                        onClick={handleDeleteCompany}
                      >
                        Eliminar definitivamente
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
      {expanded && employees.length > 0 && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={6}>
            <div className="flex flex-col gap-1.5 py-1 pl-6">
              <p className="text-xs font-medium text-muted-foreground">Empleados de {company.name}</p>
              {employees.map((emp) => (
                <div key={emp.id} className="flex items-center gap-3 text-sm">
                  <span className="min-w-[160px]">{displayName(emp)}</span>
                  <span className="text-muted-foreground">{ROLE_LABELS[emp.role]}</span>
                  <Badge variant={emp.status === "ACTIVE" ? "success" : "destructive"}>
                    {STATUS_LABELS[emp.status]}
                  </Badge>
                </div>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
