"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buildPriceListPDF, type PriceListProduct } from "@/lib/price-list-pdf";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { ReferenceCurrency } from "@prisma/client";

export function PriceListButton({
  products,
  company,
  referenceCurrency,
  className,
}: {
  products: PriceListProduct[];
  company: DeliveryNoteCompany;
  referenceCurrency: ReferenceCurrency;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const doc = await buildPriceListPDF(products, company, referenceCurrency);
      doc.save("lista-de-precios.pdf");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" disabled={busy} onClick={download} className={className}>
      {busy ? "Generando..." : "Descargar lista de precios"}
    </Button>
  );
}
