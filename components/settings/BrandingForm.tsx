"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateBranding } from "@/lib/actions/settings";

const MAX_DIMENSION = 160;

function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo procesar la imagen"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export function BrandingForm({
  currentLogo,
  currentColor,
}: {
  currentLogo: string | null;
  currentColor: string | null;
}) {
  const router = useRouter();
  const [logoDataUrl, setLogoDataUrl] = useState(currentLogo ?? "");
  const [brandColor, setBrandColor] = useState(currentColor ?? "#111111");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeToDataUrl(file);
      setLogoDataUrl(dataUrl);
    } catch {
      setError("No se pudo procesar la imagen. Intenta con otro archivo.");
    }
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("logoDataUrl", logoDataUrl);
    formData.set("brandColor", brandColor);
    startTransition(async () => {
      const result = await updateBranding(formData);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4 max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label>Logo de la empresa</Label>
        <div className="flex items-center gap-3">
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoDataUrl}
              alt="Logo"
              className="h-12 w-12 rounded object-cover border"
            />
          ) : (
            <div className="h-12 w-12 rounded border flex items-center justify-center text-xs text-muted-foreground">
              Sin logo
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="brandColorInput">Color corporativo</Label>
        <div className="flex items-center gap-3">
          <input
            id="brandColorInput"
            type="color"
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            className="h-9 w-14 rounded border cursor-pointer"
          />
          <span className="text-sm text-muted-foreground">{brandColor}</span>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar personalización"}
      </Button>
    </form>
  );
}
