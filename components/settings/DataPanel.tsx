"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import type { PrintPaperSize } from "@prisma/client";
import { FileTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintPaperSizeForm } from "@/components/settings/PrintPaperSizeForm";
import { FieldTextarea, Field, ListRow, SCard, SubTitle, TWO_COLS } from "@/components/settings/team-print-kit";
import { printHtmlDocument } from "@/lib/print-html";
import { downloadWorkbook } from "@/lib/spreadsheet";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
import { listPendingSales } from "@/lib/offline/sync";
import {
  exportPaymentsBackup,
  exportSalesHistory,
  sendDailyReportTest,
  setDailyReportEmails,
} from "@/lib/actions/data-export";

const PRINTERS: { id: string; label: string; desc: string; note: string; paper: PrintPaperSize }[] = [
  { id: "t80", label: "Ticket 80 mm", desc: "Impresora térmica del mostrador", note: "Principal", paper: "THERMAL_80" },
  { id: "t58", label: "Ticket 58 mm", desc: "Impresora portátil", note: "Reserva", paper: "THERMAL_58" },
  { id: "carta", label: "Hoja carta", desc: "Impresora de oficina / PDF", note: "Facturas y presupuestos", paper: "LETTER" },
];

// Imprime una página de prueba en el formato elegido, con el mismo mecanismo
// (iframe aislado + @page del tamaño) que el resto de documentos.
function printTest(p: (typeof PRINTERS)[number]) {
  const body = `<div style="font-family:system-ui,sans-serif"><h1 style="font-size:1.3em;margin:8px 0">Prueba de impresión</h1><p style="margin:4px 0">Formato: ${p.label}</p><p style="margin:4px 0">${new Date().toLocaleString("es-VE")}</p><div style="border:1px dashed #000;padding:6px;margin-top:8px;text-align:center">Si ves este recuadro completo, tu impresora está bien configurada.</div></div>`;
  printHtmlDocument(body, p.paper, "Prueba de impresión").catch(() => toast.error("No se pudo abrir la impresión."));
}

export function DataPanel({ initialEmails, currentPaperSize, canManage }: { initialEmails: string[]; currentPaperSize: PrintPaperSize; canManage: boolean }) {
  const online = useOnlineStatus();
  const [pending, setPending] = useState<number | null>(null);
  const [emails, setEmails] = useState(initialEmails.join("\n"));
  const [busy, start] = useTransition();

  useEffect(() => {
    let alive = true;
    listPendingSales()
      .then((l) => alive && setPending(l.length))
      .catch(() => alive && setPending(null));
    return () => {
      alive = false;
    };
  }, []);

  function exportSheet(kind: "ventas" | "cobros") {
    start(async () => {
      try {
        const rows = kind === "ventas" ? await exportSalesHistory() : await exportPaymentsBackup();
        await downloadWorkbook([{ name: kind === "ventas" ? "Ventas" : "Cobros", rows }], `${kind === "ventas" ? "historial-de-ventas" : "respaldo-de-cobros"}.xlsx`);
      } catch {
        toast.error("No se pudo generar el archivo.");
      }
    });
  }

  function save() {
    start(async () => {
      const list = emails.split(/[,;\s]+/).filter(Boolean);
      const r = await setDailyReportEmails(list);
      if (r.success) toast.success(list.length ? "Correos del reporte guardados." : "Reporte diario desactivado.");
      else toast.error(r.error);
    });
  }

  function test() {
    start(async () => {
      const r = await sendDailyReportTest();
      if (r.success) toast.success("Prueba enviada. Revisa tu correo.");
      else toast.error(r.error);
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div className={TWO_COLS}>
        <SCard title="Impresoras y formato" description="Ticket térmico, hoja carta, PDF y WhatsApp">
          {PRINTERS.map((p) => (
            <ListRow key={p.id} title={p.label} sub={`${p.desc} · ${p.note}`}>
              <Button type="button" variant="outline" onClick={() => printTest(p)}>
                Imprimir prueba
              </Button>
            </ListRow>
          ))}
          <p className="mt-2 text-[13px] text-muted-foreground">Todo ticket se puede imprimir, descargar en PDF o enviar por WhatsApp.</p>
          <PrintPaperSizeForm currentPaperSize={currentPaperSize} />
        </SCard>

        {canManage && (
          <SCard title="Datos y exportaciones" description="Respaldo completo de tus cobros">
            <p className="mb-2.5 text-muted-foreground">Excel con todos tus cobros desde el primer día: fecha, hora, método, referencia y monto en Bs o divisa.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => exportSheet("ventas")}>
                <FileTextIcon /> Historial de ventas (Excel)
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => exportSheet("cobros")}>
                <FileTextIcon /> Respaldo de cobros (Excel)
              </Button>
            </div>
            <SubTitle className="mt-4">Reporte diario por correo</SubTitle>
            <Field label="Correos, uno por línea (máx. 5)" htmlFor="m-c">
              <FieldTextarea
                id="m-c"
                aria-label="Correos del reporte diario"
                rows={Math.max(1, Math.min(5, emails.split("\n").length))}
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="dueno@correo.com"
              />
            </Field>
            <p className="mt-2 text-[13px] text-muted-foreground">Se envía cada noche con las ventas del día, junto con la actualización de la tasa.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" disabled={busy} onClick={save}>
                Guardar
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={test}>
                Enviar prueba
              </Button>
            </div>
          </SCard>
        )}
      </div>

      <SCard title="Modo sin internet" description="Las ventas se guardan en este equipo durante un corte y se sincronizan al volver la conexión">
        <ListRow
          title={online ? "Conectado a internet" : "Sin conexión"}
          sub={pending === null ? undefined : pending === 0 ? "No hay ventas pendientes por sincronizar." : `${pending} ${pending === 1 ? "venta pendiente" : "ventas pendientes"} por sincronizar.`}
        >
          <span className={`size-3 rounded-full ${online ? "bg-[var(--ok-solid)]" : "bg-[var(--warn-solid)]"}`} aria-hidden />
        </ListRow>
      </SCard>
    </div>
  );
}
