"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2Icon } from "lucide-react";
import type { Company, Role, User, UserStatus } from "@prisma/client";
import { MasterDetail, MobileRow } from "@/components/shared/MasterDetail";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { isCompanyBlocked, TRIAL_DAYS } from "@/lib/billing";
import { FEATURES } from "@/lib/features";
import {
  approveUser,
  denyUser,
  suspendUser,
  reactivateUser,
  recordMaintenancePayment,
  renewSubscriptionManually,
  setCompanyExempt,
  setCompanyFeatures,
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

// Mirrors the `select` in listAllCompanies() (lib/actions/admin.ts) exactly —
// narrower than the full Prisma Company/User (no Decimal exchangeRate, no
// passwordHash) since this crosses into a Client Component.
type AdminCompanyUser = Pick<
  User,
  "id" | "email" | "firstName" | "lastName" | "role" | "status" | "isSuperAdmin"
>;
type AdminCompany = Pick<
  Company,
  "id" | "name" | "isExempt" | "nextPaymentDueDate" | "monthlyFeeUsdCents" | "enabledFeatures" | "createdAt"
> & { users: AdminCompanyUser[] };

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
  // A company without an owner row has nothing to show or act on.
  const withOwner = companies.filter((c) => c.users.length > 0);
  return (
    <MasterDetail
      items={withOwner}
      label="Empresas"
      empty={
        <div className="rounded-lg border bg-card shadow-xs">
          <EmptyState icon={Building2Icon} title="No hay empresas registradas todavía." className="py-10" />
        </div>
      }
      renderRowMobile={(c) => (
        <MobileRow
          title={c.name}
          meta={c.users[0].email}
          badge={<Badge variant={statusVariant(c.users[0].status)}>{STATUS_LABELS[c.users[0].status]}</Badge>}
        />
      )}
      renderRow={(c) => (
        <>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
            <Building2Icon className="size-4 text-muted-foreground/60" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{c.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{c.users[0].email}</span>
          </span>
          <Badge variant={statusVariant(c.users[0].status)}>{STATUS_LABELS[c.users[0].status]}</Badge>
        </>
      )}
      renderDetail={(c) => <AdminCompanyDetail key={c.id} company={c} currentUserId={currentUserId} />}
    />
  );
}

function statusVariant(status: UserStatus) {
  return status === "ACTIVE" ? "success" : status === "PENDING" ? "outline" : "destructive";
}

function AdminCompanyDetail({
  company,
  currentUserId,
}: {
  company: AdminCompany;
  currentUserId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const owner = company.users[0];
  const employees = company.users.slice(1);

  // Both left blank by default — approveUser fills them in with the
  // platform's default fee and a 14-day free trial when submitted empty;
  // an admin only needs to type something here to override that for this
  // one company.
  const [feeUsd, setFeeUsd] = useState("");
  const [approveDueDate, setApproveDueDate] = useState("");
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
  const [renewError, setRenewError] = useState<string | null>(null);

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

  function handleRenew(e: React.MouseEvent) {
    e.preventDefault();
    setRenewError(null);
    startTransition(async () => {
      const result = await renewSubscriptionManually(company.id);
      if (!result.success) {
        setRenewError(result.error);
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
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold leading-tight">{company.name}</h3>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {owner.email}
          {owner.isSuperAdmin && <Badge variant="outline">Admin</Badge>}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Estado</dt>
          <dd>
            <Badge variant={statusVariant(owner.status)}>{STATUS_LABELS[owner.status]}</Badge>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Registrado</dt>
          <dd className="font-medium">{formatDate(company.createdAt)}</dd>
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Cobro</dt>
          <dd>
            {company.isExempt ? (
              <Badge variant="outline">Exonerada</Badge>
            ) : blocked ? (
              <Badge variant="destructive">Bloqueada por pago</Badge>
            ) : company.nextPaymentDueDate ? (
              <Badge variant="outline">Vence el {formatDate(company.nextPaymentDueDate)}</Badge>
            ) : (
              <Badge variant="outline">Sin ciclo configurado</Badge>
            )}
          </dd>
        </div>
      </dl>
      <div className="border-t pt-4">
    <div className="flex flex-wrap gap-2">
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
                  Al aprobar, la empresa queda activa de inmediato con {TRIAL_DAYS} días de
                  prueba gratis. Deja los campos en blanco para usar el precio mensual
                  estándar de la plataforma — solo complétalos si esta empresa necesita un
                  trato distinto (precio o fecha de vencimiento personalizados).
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`fee-${owner.id}`}>Monto mensual (USD) — opcional</Label>
                  <Input
                    id={`fee-${owner.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={feeUsd}
                    onChange={(e) => setFeeUsd(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">En blanco = precio estándar de la plataforma.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`due-${owner.id}`}>Fecha de vencimiento — opcional</Label>
                  <Input
                    id={`due-${owner.id}`}
                    type="date"
                    value={approveDueDate}
                    onChange={(e) => setApproveDueDate(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    En blanco = {TRIAL_DAYS} días de prueba gratis a partir de hoy.
                  </p>
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
                />
                <p className="text-xs text-muted-foreground">Ej. Transferencia ref. 001234567</p>
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
      {owner.status === "ACTIVE" && !company.isExempt && (
        <Dialog>
          <DialogTrigger render={<Button size="sm" variant="outline" disabled={isPending} />}>
            Renovar suscripción manual
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Renovar la suscripción de {company.name} manualmente?</DialogTitle>
              <DialogDescription>
                Esto reinicia su ciclo de cobro a partir de hoy, sin registrar un monto pagado.
                La empresa tendrá 5 días para reportar y completar su pago — si no lo hace, el
                sistema se bloqueará de nuevo automáticamente.
              </DialogDescription>
            </DialogHeader>
            {renewError && <p className="text-sm text-destructive">{renewError}</p>}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <DialogClose render={<Button disabled={isPending} />} onClick={handleRenew}>
                Renovar
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
      </div>
      {FEATURES.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground">
            Apartados personalizados — solo para {company.name}
          </p>
          {FEATURES.map((feature) => {
            const enabled = company.enabledFeatures.includes(feature.id);
            return (
              <label key={feature.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={enabled}
                  disabled={isPending}
                  onChange={() =>
                    run(() =>
                      setCompanyFeatures(
                        company.id,
                        enabled
                          ? company.enabledFeatures.filter((id) => id !== feature.id)
                          : [...company.enabledFeatures, feature.id]
                      )
                    )
                  }
                />
                <span>
                  <span className="font-medium">{feature.label}</span>
                  <span className="block text-xs text-muted-foreground">{feature.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}
      {employees.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground">
            Empleados de {company.name} ({employees.length})
          </p>
          {employees.map((emp) => (
            <div key={emp.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-medium">{displayName(emp)}</span>
              <span className="text-muted-foreground">{ROLE_LABELS[emp.role]}</span>
              <Badge variant={emp.status === "ACTIVE" ? "success" : "destructive"}>
                {STATUS_LABELS[emp.status]}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
