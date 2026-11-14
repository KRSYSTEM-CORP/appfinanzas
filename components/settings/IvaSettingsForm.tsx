"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard, ListRow, Note } from "@/components/shared/SectionCard";
import { Field, FieldPair, FIELD_CONTROL } from "@/components/shared/Field";
import { SheetActions } from "@/components/shared/ConfirmSheet";
import { Switch } from "@/components/settings/SettingsUi";
import { updateIvaSettings, type IvaSettingsInfo } from "@/lib/actions/settings";

type Values = {
  ivaEnabled: boolean;
  ivaGeneralRatePercent: string;
  ivaReducedRatePercent: string;
  isIvaWithholdingAgent: boolean;
  ivaWithholdingPercent: string;
  isIgtfAgent: boolean;
  igtfRatePercent: string;
};

function toValues(i: IvaSettingsInfo): Values {
  return {
    ivaEnabled: i.ivaEnabled,
    ivaGeneralRatePercent: String(i.ivaGeneralRatePercent),
    ivaReducedRatePercent: String(i.ivaReducedRatePercent),
    isIvaWithholdingAgent: i.isIvaWithholdingAgent,
    ivaWithholdingPercent: String(i.ivaWithholdingPercent),
    isIgtfAgent: i.isIgtfAgent,
    igtfRatePercent: String(i.igtfRatePercent),
  };
}

// Ajustes → Pagos y Moneda → «Impuestos y cargos»: IGTF, IVA y retención de IVA. Los interruptores
// se guardan al tocarlos; «Editar» abre la hoja con las alícuotas. (El cargo por servicio aún no
// existe en el sistema.)
export function IvaSettingsForm({ initial, rif }: { initial: IvaSettingsInfo; rif: string | null }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => toValues(initial));
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save(next: Values, done?: () => void, message = "Configuración de impuestos guardada.") {
    const prev = values;
    setValues(next);
    startTransition(async () => {
      const formData = new FormData();
      for (const [k, v] of Object.entries(next)) formData.set(k, String(v));
      const result = await updateIvaSettings(formData);
      if (result.success) {
        toast.success(message);
        done?.();
        router.refresh();
      } else {
        setValues(prev);
        toast.error(result.error);
      }
    });
  }

  return (
    <SectionCard title="Impuestos y cargos" subtitle="Reglas aplicadas al calcular la cuenta">
      <ListRow>
        <div>
          <b>IGTF ({values.igtfRatePercent} %)</b>
          <small>Se cobra sobre los pagos en divisas. Desactívalo si tu empresa no cobra IGTF</small>
        </div>
        <Switch on={values.isIgtfAgent} disabled={isPending} onChange={(v) => save({ ...values, isIgtfAgent: v })} label="IGTF" />
      </ListRow>
      <ListRow>
        <div>
          <b>Usar IVA</b>
          <small>{values.ivaEnabled ? "La venta y la compra desglosan base imponible e IVA" : "Sin IVA: no se calcula ni se muestra; el total es igual al subtotal"}</small>
        </div>
        <Switch on={values.ivaEnabled} disabled={isPending} onChange={(v) => save({ ...values, ivaEnabled: v })} label="Usar IVA" />
      </ListRow>
      {values.ivaEnabled && (
      <>
      <ListRow>
        <div>
          <b>IVA ({values.ivaGeneralRatePercent} %)</b>
          <small>Incluido en tus precios; se desglosa en los documentos fiscales{rif ? ` con el RIF ${rif}` : ""}</small>
        </div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Editar
        </Button>
      </ListRow>
      <ListRow>
        <div>
          <b>Retención de IVA ({values.ivaWithholdingPercent} %)</b>
          <small>Si el SENIAT te designó contribuyente especial, retienes parte del IVA a tus proveedores</small>
        </div>
        <Switch on={values.isIvaWithholdingAgent} disabled={isPending} onChange={(v) => save({ ...values, isIvaWithholdingAgent: v })} label="Retención de IVA" />
      </ListRow>
      </>
      )}
      {open && <RatesSheet values={values} pending={isPending} onClose={() => setOpen(false)} onSave={(v) => save(v, () => setOpen(false))} />}
    </SectionCard>
  );
}

function RatesSheet({ values, pending, onClose, onSave }: { values: Values; pending: boolean; onClose: () => void; onSave: (v: Values) => void }) {
  const [draft, setDraft] = useState(values);
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value });
  const num = (v: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void) => (
    <input type="number" min={0} max={100} step={1} inputMode="numeric" value={v} onChange={onChange} className={FIELD_CONTROL} />
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Impuestos y cargos</DialogTitle>
          <DialogDescription>Alícuotas que usa el sistema al calcular la cuenta</DialogDescription>
        </DialogHeader>
        <FieldPair>
          <Field label="Tasa general de IVA (%)">{num(draft.ivaGeneralRatePercent, set("ivaGeneralRatePercent"))}</Field>
          <Field label="Tasa reducida de IVA (%)">{num(draft.ivaReducedRatePercent, set("ivaReducedRatePercent"))}</Field>
        </FieldPair>
        <Note>Se usan para separar el precio (que ya incluye IVA) en base imponible e IVA en el Libro de Ventas y la factura, según el tratamiento de cada producto.</Note>
        <FieldPair>
          <Field label="Retención de IVA (%)">{num(draft.ivaWithholdingPercent, set("ivaWithholdingPercent"))}</Field>
          <Field label="Alícuota de IGTF (%)">{num(draft.igtfRatePercent, set("igtfRatePercent"))}</Field>
        </FieldPair>
        <Note>El IGTF aparece desglosado en la factura y en el Libro de Ventas. Confírmalo con tu contador antes de activarlo.</Note>
        <SheetActions>
          <Button disabled={pending} onClick={() => onSave(draft)}>
            Guardar
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </SheetActions>
      </DialogContent>
    </Dialog>
  );
}
