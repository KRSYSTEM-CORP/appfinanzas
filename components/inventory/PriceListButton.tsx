"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import {
  buildCatalogPDF,
  buildPriceListPDF,
  loadCatalogImages,
  type PriceListProduct,
} from "@/lib/price-list-pdf";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { ReferenceCurrency } from "@prisma/client";

export function PriceListButton({
  products,
  company,
  referenceCurrency,
  className,
  flat = false,
}: {
  products: PriceListProduct[];
  company: DeliveryNoteCompany;
  referenceCurrency: ReferenceCurrency;
  className?: string;
  // true: ya está dentro de otro menú, muestra las dos opciones sin menú propio.
  flat?: boolean;
}) {
  const [busy, setBusy] = useState<"list" | "catalog" | null>(null);

  async function downloadList() {
    setBusy("list");
    try {
      const doc = await buildPriceListPDF(products, company, referenceCurrency);
      doc.save("lista-de-precios.pdf");
    } finally {
      setBusy(null);
    }
  }

  async function downloadCatalog() {
    setBusy("catalog");
    try {
      const withImages = await loadCatalogImages(products);
      const doc = await buildCatalogPDF(withImages, company, referenceCurrency);
      doc.save("catalogo-de-productos.pdf");
    } finally {
      setBusy(null);
    }
  }

  const catalogLabel = busy === "catalog" ? "Generando catálogo..." : "Catálogo con imágenes (PDF)";

  if (flat) {
    return (
      <>
        <Button type="button" variant="ghost" disabled={busy !== null} onClick={downloadList} className={className}>
          {busy === "list" ? "Generando..." : "Lista de precios (PDF)"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy !== null} onClick={downloadCatalog} className={className}>
          {catalogLabel}
        </Button>
      </>
    );
  }

  return (
    <ActionMenu
      align="start"
      trigger={<Button type="button" variant="outline" size="lg" disabled={busy !== null} className={className} />}
      triggerChildren={busy ? "Generando..." : "Lista de precios"}
      contentClassName="md:w-64"
    >
      <Button type="button" variant="ghost" onClick={downloadList} className="w-full justify-start">
        Lista de precios (PDF)
      </Button>
      <Button type="button" variant="ghost" onClick={downloadCatalog} className="w-full justify-start">
        {catalogLabel}
      </Button>
    </ActionMenu>
  );
}
