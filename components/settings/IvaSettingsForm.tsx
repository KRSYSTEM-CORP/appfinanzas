"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateIvaSettings, type IvaSettingsInfo } from "@/lib/actions/settings";

export function IvaSettingsForm({ initial }: { initial: IvaSettingsInfo }) {
  const router = useRouter();
  const [ivaGeneralRatePercent, setIvaGeneralRatePercent] = useState(String(initial.ivaGeneralRatePercent));
  const [ivaReducedRatePercent, setIvaReducedRatePercent] = useState(String(initial.ivaReducedRatePercent));
  const [isIvaWithholdingAgent, setIsIvaWithholdingAgent] = useState(initial.isIvaWithholdingAgent);
  const [ivaWithholdingPercent, setIvaWithholdingPercent] = useState(String(initial.ivaWithholdingPercent));
  const [isIgtfAgent, setIsIgtfAgent] = useState(initial.isIgtfAgent);
  const [igtfRatePercent, setIgtfRatePercent] = useState(String(initial.igtfRatePercent));
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const formData = new FormData();
      formData.set("ivaGeneralRatePercent", ivaGeneralRatePercent);
      formData.set("ivaReducedRatePercent", ivaReducedRatePercent);
      formData.set("isIvaWithholdingAgent", String(isIvaWithholdingAgent));
      formData.set("ivaWithholdingPercent", ivaWithholdingPercent);
      formData.set("isIgtfAgent", String(isIgtfAgent));
      formData.set("igtfRatePercent", igtfRatePercent);
      const result = await updateIvaSettings(formData);
      if (result.success) {
        toast.success("Configuración de IVA guardada.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ivaGeneralRatePercent">Tasa general de IVA (%)</Label>
          <Input
            id="ivaGeneralRatePercent"
            type="number"
            min={0}
            max={100}
            step={1}
            value={ivaGeneralRatePercent}
            onChange={(e) => setIvaGeneralRatePercent(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ivaReducedRatePercent">Tasa reducida de IVA (%)</Label>
          <Input
            id="ivaReducedRatePercent"
            type="number"
            min={0}
            max={100}
            step={1}
            value={ivaReducedRatePercent}
            onChange={(e) => setIvaReducedRatePercent(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Se usan para descomponer el precio (que ya incluye IVA) en base imponible + IVA en el Libro
        de Ventas y la Factura, según el tratamiento de IVA de cada producto.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label>¿Eres agente de retención de IVA?</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={!isIvaWithholdingAgent ? "default" : "outline"}
            onClick={() => setIsIvaWithholdingAgent(false)}
            className="flex-1"
          >
            No
          </Button>
          <Button
            type="button"
            variant={isIvaWithholdingAgent ? "default" : "outline"}
            onClick={() => setIsIvaWithholdingAgent(true)}
            className="flex-1"
          >
            Sí (contribuyente especial)
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Si el SENIAT te designó contribuyente especial, debes retener un porcentaje del IVA a tus
          proveedores. Actívalo solo si aplica a tu empresa.
        </p>
      </div>

      {isIvaWithholdingAgent && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ivaWithholdingPercent">Porcentaje de retención (%)</Label>
          <Input
            id="ivaWithholdingPercent"
            type="number"
            min={0}
            max={100}
            step={1}
            value={ivaWithholdingPercent}
            onChange={(e) => setIvaWithholdingPercent(e.target.value)}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>¿Eres agente de percepción de IGTF?</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={!isIgtfAgent ? "default" : "outline"}
            onClick={() => setIsIgtfAgent(false)}
            className="flex-1"
          >
            No
          </Button>
          <Button
            type="button"
            variant={isIgtfAgent ? "default" : "outline"}
            onClick={() => setIsIgtfAgent(true)}
            className="flex-1"
          >
            Sí
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Si lo activas, a cada pago en divisas (Zelle, Binance, PayPal o efectivo en divisas) se le
          calcula el IGTF, que se cobra aparte del total y aparece desglosado en la factura y en el
          Libro de Ventas. Confírmalo con tu contador antes de activarlo.
        </p>
      </div>

      {isIgtfAgent && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="igtfRatePercent">Alícuota de IGTF (%)</Label>
          <Input
            id="igtfRatePercent"
            type="number"
            min={0}
            max={100}
            step={1}
            value={igtfRatePercent}
            onChange={(e) => setIgtfRatePercent(e.target.value)}
          />
        </div>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar configuración de impuestos"}
      </Button>
    </form>
  );
}
