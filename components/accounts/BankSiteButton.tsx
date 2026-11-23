"use client";

import { ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openBankSite } from "@/lib/open-bank-site";

// «Ir al banco»: abre la página del banco de la cuenta en una ventana de KR POS, para ver el movimiento o hacer la operación.
export function BankSiteButton({ url, bankName, className }: { url: string; bankName: string; className?: string }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={className}
      onClick={async () => {
        const ok = await openBankSite(url);
        if (!ok) toast.error("Tu navegador bloqueó la ventana. Permite las ventanas emergentes de KR POS e inténtalo de nuevo.");
      }}
    >
      <ExternalLinkIcon aria-hidden className="size-4" /> Ir a {bankName}
    </Button>
  );
}
