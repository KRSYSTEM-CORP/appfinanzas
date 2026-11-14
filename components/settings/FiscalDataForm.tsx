"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/SectionCard";
import { Field, FieldPair, FIELD_CONTROL } from "@/components/shared/Field";
import { updateFiscalData, type FiscalData } from "@/lib/actions/settings";
import { BUSINESS_COUNTRIES, countryLabel } from "@/lib/business-country";

// Ajustes → Negocio: «Información del negocio». Sin horario de atención (decisión del dueño).
export function FiscalDataForm({ initial }: { initial: FiscalData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const country = initial.businessCountry ?? "Venezuela";
  const known = BUSINESS_COUNTRIES.some((c) => c.name.toLowerCase() === country.toLowerCase());

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateFiscalData(formData);
      if (result.success) {
        toast.success("Guardado");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <SectionCard title="Información del negocio" subtitle="Visible en tickets, facturas y presupuestos">
      <form action={handleSubmit}>
        <Field label="Razón social">
          <input name="fiscalLegalName" defaultValue={initial.fiscalLegalName ?? ""} placeholder="Ej. Comercial Ejemplo, C.A." className={FIELD_CONTROL} />
        </Field>
        <Field label="RIF">
          <input name="fiscalRif" defaultValue={initial.fiscalRif ?? ""} placeholder="Ej. J-12345678-9" className={FIELD_CONTROL} />
        </Field>
        <FieldPair>
          <Field label="País">
            <select name="businessCountry" defaultValue={known ? BUSINESS_COUNTRIES.find((c) => c.name.toLowerCase() === country.toLowerCase())!.name : country} className={FIELD_CONTROL}>
              {BUSINESS_COUNTRIES.map((c) => (
                <option key={c.name} value={c.name}>
                  {countryLabel(c)}
                </option>
              ))}
              {!known && <option value={country}>{country}</option>}
            </select>
          </Field>
          <Field label="WhatsApp de contacto">
            <input name="businessWhatsapp" type="tel" inputMode="tel" defaultValue={initial.businessWhatsapp ?? ""} placeholder="412-5550101" className={FIELD_CONTROL} />
          </Field>
        </FieldPair>
        <Field label="Instagram">
          <input name="businessInstagram" defaultValue={initial.businessInstagram ?? ""} placeholder="@minegocio" className={FIELD_CONTROL} />
        </Field>
        <Field label="Dirección">
          <input name="fiscalAddress" defaultValue={initial.fiscalAddress ?? ""} placeholder="Av. Principal, Local 4 · Valencia" className={FIELD_CONTROL} />
        </Field>
        <Field label="Teléfono">
          <input name="fiscalPhone" type="tel" defaultValue={initial.fiscalPhone ?? ""} placeholder="Ej. 0212-1234567" className={FIELD_CONTROL} />
        </Field>
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
