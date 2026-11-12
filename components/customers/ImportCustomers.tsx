"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DownloadIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importCustomers } from "@/lib/actions/marketing";
import { downloadWorkbook, readFirstSheet } from "@/lib/spreadsheet";

const HEADERS = ["Nombre", "Apellido", "Teléfono", "Dirección", "Cédula/RIF", "Correo"];

// Importar Excel + Plantilla de clientes.
export function ImportCustomers() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    try {
      const rows = await readFirstSheet(await file.arrayBuffer());
      const mapped = rows.map((r) => ({
        firstName: String(r["Nombre"] ?? ""),
        lastName: String(r["Apellido"] ?? ""),
        phone: String(r["Teléfono"] ?? r["Telefono"] ?? ""),
        address: String(r["Dirección"] ?? r["Direccion"] ?? "") || undefined,
        rif: String(r["Cédula/RIF"] ?? "") || undefined,
        email: String(r["Correo"] ?? "") || undefined,
      }));
      start(async () => {
        const res = await importCustomers(mapped);
        if (!res.success) toast.error(res.error);
        else toast.success(`Importados: ${res.created} nuevos, ${res.updated} actualizados, ${res.skipped} omitidos`);
        router.refresh();
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el archivo");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <Button type="button" variant="outline" disabled={busy || pending} onClick={() => fileRef.current?.click()}>
        <UploadIcon /> Importar Excel
      </Button>
      <Button type="button" variant="outline" onClick={() => downloadWorkbook([{ name: "Clientes", rows: [HEADERS, ["María", "Pérez", "0412-5550101", "Valencia", "V-12345678", "maria@correo.com"]] }], "plantilla-clientes.xlsx")}>
        <DownloadIcon /> Plantilla
      </Button>
    </div>
  );
}
