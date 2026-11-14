"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { MonitorIcon, QrCodeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { accountClipboardText, ACCOUNT_KIND_LABELS } from "@/lib/payment-accounts";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import { formatAmount } from "@/lib/pos/checkout";
import type { PaymentAccountRow } from "@/lib/actions/payment-accounts";
import type { ReferenceCurrency } from "@prisma/client";

// «Mostrar al cliente»: pantalla para el cliente con el total, la tasa del día
// y un QR con los datos de pago (todas las cuentas de cobro activas).
export function CustomerDisplay({
  totalCents,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  accounts,
}: {
  totalCents: number;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  accounts: PaymentAccountRow[];
}) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const qrText = accounts.map((a) => accountClipboardText(a)).join("\n\n");
  const kinds = Array.from(new Set(accounts.map((a) => ACCOUNT_KIND_LABELS[a.kind])));

  useEffect(() => {
    if (!open || !qrText) return;
    let alive = true;
    QRCode.toDataURL(qrText, { margin: 1, width: 240 })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [open, qrText]);

  const local = exchangeRateEnabled && rate != null ? formatLocalCurrency(eurCentsToLocal(totalCents, rate), currencyCode) : null;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <MonitorIcon className="size-4" strokeWidth={2.2} aria-hidden /> Mostrar al cliente
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogTitle className="sr-only">Pantalla para el cliente</DialogTitle>
          <div className="flex flex-col items-center gap-2.5 py-2.5 text-center">
            <p className="kr-eyebrow">Pantalla para el cliente</p>
            <div className="text-[54px] leading-[1.05] font-extrabold tracking-[-0.04em] tabular-nums">
              {formatCurrencyCents(referenceCurrency, totalCents)}
            </div>
            {local && <div className="text-[22px] tabular-nums">{local}</div>}
            <div className="flex max-w-[260px] flex-col items-center gap-1.5 rounded-[18px] bg-white p-4 text-black">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="Código QR con los datos de pago" className="size-[150px]" />
              ) : (
                <QrCodeIcon className="size-[110px]" strokeWidth={1.4} aria-hidden />
              )}
              <small className="text-black/60">
                {accounts.length
                  ? `Escanea para ver los datos de ${kinds.join(", ").replace(/, ([^,]*)$/, " y $1")}`
                  : "Agrega tus cuentas de cobro en Administración para mostrar el QR"}
              </small>
            </div>
            {exchangeRateEnabled && rate != null && (
              <p className="text-muted-foreground">
                Tasa del día: {currencyCode === "VES" ? "Bs" : currencyCode} {formatAmount(rate)} por {referenceCurrency === "EUR" ? "€" : "$"}1
              </p>
            )}
            <div className="flex justify-center">
              <Button type="button" onClick={() => setOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
