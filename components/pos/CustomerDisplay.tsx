"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { MonitorIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Price } from "@/components/money/Price";
import { accountClipboardText } from "@/lib/payment-accounts";
import { formatLocalCurrency } from "@/lib/currencies";
import type { PaymentAccountRow } from "@/lib/actions/payment-accounts";
import type { ReferenceCurrency } from "@prisma/client";

// «Mostrar al cliente»: pantalla para el cliente con el total, la tasa del día y un QR con los datos de pago.
export function CustomerDisplay({
  totalCents,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  account,
}: {
  totalCents: number;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  account: PaymentAccountRow | null;
}) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !account) return;
    let alive = true;
    QRCode.toDataURL(accountClipboardText(account), { margin: 1, width: 240 })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [open, account]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-muted px-3.5 text-[13px] font-bold text-primary">
        <MonitorIcon className="size-4" aria-hidden /> Mostrar al cliente
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Total a pagar</DialogTitle>
            <DialogDescription>Pantalla para el cliente</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <Price eurCents={totalCents} rate={rate} currencyCode={currencyCode} exchangeRateEnabled={exchangeRateEnabled} referenceCurrency={referenceCurrency} size="lg" className="items-center [&>span:first-child]:text-[44px] [&>span:first-child]:font-extrabold" />
            {exchangeRateEnabled && rate != null && (
              <p className="text-sm text-muted-foreground">Tasa del día: {formatLocalCurrency(rate, currencyCode)} por {referenceCurrency === "EUR" ? "€" : "$"}</p>
            )}
            {account ? (
              <>
                {qr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="Código QR con los datos de pago" className="size-48 rounded-[14px] bg-white p-2" />
                )}
                <p className="whitespace-pre-line text-sm font-semibold">{accountClipboardText(account)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Agrega tus cuentas en Ajustes → Pagos y Moneda para mostrar un QR de pago.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
