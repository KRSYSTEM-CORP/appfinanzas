"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentMethod } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { formatDate, formatUSD, PAYMENT_METHOD_LABELS } from "@/lib/format";
import {
  approvePaymentReport,
  rejectPaymentReport,
  updatePlatformSettings,
  fetchAndUpdatePlatformBcvRate,
} from "@/lib/actions/admin";

type PendingReportLine = {
  paymentMethod: PaymentMethod;
  amountUsdCents: number;
  reference: string | null;
};

type PendingReport = {
  id: string;
  companyId: string;
  proofImageDataUrl: string | null;
  note: string | null;
  createdAt: Date;
  company: { name: string };
  lines: PendingReportLine[];
};

export function PlatformSettingsForm({
  initialInstructions,
  initialBillingExchangeRate,
  initialDefaultMonthlyFeeUsdCents,
}: {
  initialInstructions: string | null;
  initialBillingExchangeRate: number | null;
  initialDefaultMonthlyFeeUsdCents: number | null;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [instructions, setInstructions] = useState(initialInstructions ?? "");
  const [rate, setRate] = useState(initialBillingExchangeRate != null ? String(initialBillingExchangeRate) : "");
  const [defaultFee, setDefaultFee] = useState(
    initialDefaultMonthlyFeeUsdCents != null ? String(initialDefaultMonthlyFeeUsdCents / 100) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isFetchingBcv, startBcvFetch] = useTransition();
  const [bcvError, setBcvError] = useState<string | null>(null);

  function handleFetchBcv() {
    setBcvError(null);
    setSaved(false);
    startBcvFetch(async () => {
      const result = await fetchAndUpdatePlatformBcvRate();
      if (!result.success) {
        setBcvError(result.error);
        return;
      }
      setRate(String(result.rate));
      router.refresh();
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updatePlatformSettings({
        paymentInstructions: instructions,
        billingExchangeRate: rate,
        defaultMonthlyFee: defaultFee,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-3 max-w-lg">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="platform-default-fee">Precio mensual estándar (USD)</Label>
        <Input
          id="platform-default-fee"
          type="number"
          step="0.01"
          min="0"
          value={defaultFee}
          onChange={(e) => {
            setDefaultFee(e.target.value);
            setSaved(false);
          }}
          placeholder="Ej. 25.00"
        />
        <p className="text-xs text-muted-foreground">
          Se aplica automáticamente a toda empresa nueva al aprobarla, salvo que le pongas un
          precio distinto en ese momento.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="platform-rate">Tasa de cambio de la plataforma (Bs/USD)</Label>
        <div className="flex gap-2">
          <Input
            id="platform-rate"
            type="number"
            step="0.0001"
            min="0"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              setSaved(false);
            }}
            placeholder="Ej. 45.0000"
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={handleFetchBcv}
            disabled={isFetchingBcv}
          >
            {isFetchingBcv ? "Consultando BCV..." : "Actualizar con tasa BCV"}
          </Button>
        </div>
        {bcvError && <p className="text-sm text-destructive">{bcvError}</p>}
        <p className="text-xs text-muted-foreground">
          Se actualiza sola todos los días con la tasa oficial del BCV. Al cambiarla (manual o con
          el botón), el monto en bolívares que ve cada empresa se recalcula automáticamente.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="platform-instructions">Instrucciones de pago</Label>
        <Textarea
          id="platform-instructions"
          value={instructions}
          onChange={(e) => {
            setInstructions(e.target.value);
            setSaved(false);
          }}
          rows={4}
          placeholder="Ej. Transferencia: Banco XXX, Cuenta 0134-1234-56-1234567890, RIF J-12345678-9, Titular: KR System C.A."
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && !error && <p className="text-sm text-muted-foreground">Guardado.</p>}
      <Button type="submit" size="sm" disabled={isPending} className="self-start">
        Guardar
      </Button>
    </form>
  );
}

export function PendingReportsTable({ reports }: { reports: PendingReport[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleApprove(reportId: string) {
    startTransition(async () => {
      await approvePaymentReport(reportId);
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Métodos de pago</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Nota</TableHead>
            <TableHead>Comprobante</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((r) => (
            <PendingReportRow key={r.id} report={r} isPending={isPending} onApprove={handleApprove} />
          ))}
          {reports.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No hay reportes de pago pendientes.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function PendingReportRow({
  report: r,
  isPending,
  onApprove,
}: {
  report: PendingReport;
  isPending: boolean;
  onApprove: (reportId: string) => void;
}) {
  const [isRejecting, startTransition] = useTransition();
  const router = useRouter();
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const totalUsdCents = r.lines.reduce((sum, l) => sum + l.amountUsdCents, 0);

  function handleReject(e: React.MouseEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await rejectPaymentReport(r.id, { reviewNote });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{r.company.name}</TableCell>
      <TableCell className="text-sm">
        {r.lines.map((line, i) => (
          <div key={i}>
            {PAYMENT_METHOD_LABELS[line.paymentMethod]}: {formatUSD(line.amountUsdCents)}
            {line.reference && ` (${line.reference})`}
          </div>
        ))}
      </TableCell>
      <TableCell className="font-medium">{formatUSD(totalUsdCents)}</TableCell>
      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
        {r.note ?? "—"}
      </TableCell>
      <TableCell>
        {r.proofImageDataUrl ? (
          <Dialog>
            <DialogTrigger render={<Button size="sm" variant="outline" />}>Ver</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Comprobante — {r.company.name}</DialogTitle>
              </DialogHeader>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.proofImageDataUrl} alt="Comprobante de pago" className="w-full rounded-lg border" />
            </DialogContent>
          </Dialog>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{formatDate(r.createdAt)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button size="sm" disabled={isPending} onClick={() => onApprove(r.id)}>
            Aprobar
          </Button>
          <Dialog>
            <DialogTrigger render={<Button size="sm" variant="outline" disabled={isRejecting} />}>
              Rechazar
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>¿Rechazar el reporte de {r.company.name}?</DialogTitle>
                <DialogDescription>
                  La empresa verá que fue rechazado y podrá reportar el pago de nuevo.
                </DialogDescription>
              </DialogHeader>
              <Input
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Motivo (opcional)"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                <DialogClose
                  render={<Button variant="destructive" disabled={isRejecting} />}
                  onClick={handleReject}
                >
                  Rechazar
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TableCell>
    </TableRow>
  );
}
