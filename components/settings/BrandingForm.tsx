"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard, TwoCol, Note } from "@/components/shared/SectionCard";
import { Field, FieldPair } from "@/components/shared/Field";
import { SubTitle } from "@/components/settings/SettingsUi";
import { updateBranding } from "@/lib/actions/settings";
import { resizeImageToDataUrl } from "@/lib/image-utils";
import { dominantColors } from "@/lib/logo-palette";
import { buildPalettes, type BrandPalette } from "@/lib/brand-palettes";

const MAX_DIMENSION = 160;

// Ajustes → Marca: «Logo y paleta» (subir logo, paletas recomendadas a partir del logo, color
// principal y fondo) y «Vista previa en tus documentos» (presupuesto con la marca elegida).
export function BrandingForm({
  currentLogo,
  currentColor,
  currentBackground,
  companyName,
  rif,
}: {
  currentLogo: string | null;
  currentColor: string | null;
  currentBackground: string | null;
  companyName: string;
  rif: string | null;
}) {
  const router = useRouter();
  const [logoDataUrl, setLogoDataUrl] = useState(currentLogo ?? "");
  const [brandColor, setBrandColor] = useState(currentColor ?? "#2a78d6");
  const [brandBackground, setBrandBackground] = useState(currentBackground ?? "#f9f9f7");
  const [palettes, setPalettes] = useState<BrandPalette[]>([]);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    if (!logoDataUrl) return;
    dominantColors(logoDataUrl)
      .then((c) => alive && setPalettes(buildPalettes(c)))
      .catch(() => alive && setPalettes([]));
    return () => {
      alive = false;
    };
  }, [logoDataUrl]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, { maxDimension: MAX_DIMENSION, format: "image/png" });
      setLogoDataUrl(dataUrl);
    } catch {
      toast.error("No se pudo procesar la imagen. Intenta con otro archivo.");
    }
  }

  function save() {
    const formData = new FormData();
    formData.set("logoDataUrl", logoDataUrl);
    formData.set("brandColor", brandColor);
    formData.set("brandBackground", brandBackground);
    startTransition(async () => {
      const result = await updateBranding(formData);
      if (result.success) {
        toast.success("Apariencia guardada.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const colorInput = "h-11 w-full cursor-pointer rounded-[12px] border border-border bg-background p-1";

  return (
    <TwoCol>
      <SectionCard title="Logo y paleta" subtitle="Sube tu logo y KR POS sugiere los colores de tu marca">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="sr-only" aria-label="Subir logo" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-border p-3.5 text-left transition-colors duration-150 hover:border-primary hover:bg-accent"
        >
          {logoDataUrl ? (
            <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[14px] bg-white shadow-[inset_0_0_0_1px_rgba(20,22,31,.1)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoDataUrl} alt="Logo" className="size-full object-contain p-1" />
            </span>
          ) : (
            <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-accent text-primary">
              <UploadIcon className="size-[22px]" aria-hidden />
            </span>
          )}
          <span>
            <b className="block">{logoDataUrl ? "Cambiar logo" : "Subir logo"}</b>
            <span className="text-[13px] text-muted-foreground">PNG o JPG, fondo transparente si puedes</span>
          </span>
        </button>

        <SubTitle className="mt-3.5">Paletas recomendadas</SubTitle>
        {palettes.length > 0 ? (
          <div className="flex flex-wrap gap-2.5">
            {palettes.map((p) => (
              <button
                key={p.color}
                type="button"
                aria-label={p.name}
                aria-pressed={brandColor.toLowerCase() === p.color}
                onClick={() => {
                  setBrandColor(p.color);
                  setBrandBackground(p.background);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] bg-card py-1.5 pl-1.5 pr-3 text-[13px] font-bold ${brandColor.toLowerCase() === p.color ? "border-primary" : "border-border"}`}
              >
                <i className="-mr-2.5 inline-block size-5 rounded-full border-2 border-card" style={{ background: p.color }} />
                <i className="-mr-2.5 inline-block size-5 rounded-full border-2 border-card" style={{ background: p.background }} />
                <span className="ml-3">{p.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <Note className="mt-0">{logoDataUrl ? "No encontramos colores claros en este logo. Elige los tuyos abajo." : "Sube tu logo y aquí verás paletas sugeridas con sus colores."}</Note>
        )}

        <FieldPair>
          <Field label="Color principal">
            <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className={colorInput} />
          </Field>
          <Field label="Fondo">
            <input type="color" value={brandBackground} onChange={(e) => setBrandBackground(e.target.value)} className={colorInput} />
          </Field>
        </FieldPair>
        <Note>El resto de los colores (tarjetas, bordes, texto) se ajustan solos para que todo se vea bien, con fondo claro u oscuro.</Note>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <Button disabled={isPending} onClick={save}>
            {isPending ? "Guardando..." : "Guardar apariencia"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Vista previa en tus documentos" subtitle="Así saldrán tu ticket y tu presupuesto">
        <div className="flex justify-center rounded-2xl bg-muted p-3.5">
          <div
            className="w-full max-w-[300px] rounded-[10px] border-t-[6px] bg-white p-3.5 text-xs text-slate-900 shadow-[0_2px_10px_rgba(0,0,0,.2)]"
            style={{ borderTopColor: brandColor }}
          >
            <div className="mb-2.5 flex justify-between gap-2">
              <b className="min-w-0 truncate text-sm uppercase" style={{ color: brandColor }}>
                {companyName}
              </b>
              {rif && <span className="shrink-0">RIF {rif}</span>}
            </div>
            <div className="my-1.5 font-extrabold tracking-[0.06em]" style={{ color: brandColor }}>
              PRESUPUESTO N.º PRE-0043
            </div>
            <div className="flex justify-between border-b border-dashed border-slate-300 py-1">
              <span>12 × Camisa básica M</span>
              <span>$168,00</span>
            </div>
            <div className="flex justify-between border-b border-dashed border-slate-300 py-1">
              <span>6 × Jeans slim 32</span>
              <span>$192,00</span>
            </div>
            <div className="flex justify-between py-1 font-extrabold">
              <span>Total</span>
              <span>$331,20</span>
            </div>
            <div className="mt-2.5 rounded-full p-2 text-center font-bold text-white" style={{ background: brandColor }}>
              Pagar por Pago Móvil
            </div>
          </div>
        </div>
      </SectionCard>
    </TwoCol>
  );
}
