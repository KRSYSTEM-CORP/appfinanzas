"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadWorkbook } from "@/lib/spreadsheet";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
import { listPendingSales } from "@/lib/offline/sync";
import {
  exportPaymentsBackup,
  exportSalesHistory,
  sendDailyReportTest,
  setDailyReportEmails,
} from "@/lib/actions/data-export";

const PRINTERS = [
  { id: "t80", label: "Ticket 80 mm", note: "Principal", page: "80mm auto", width: "72mm" },
  { id: "t58", label: "Ticket 58 mm", note: "Reserva", page: "58mm auto", width: "50mm" },
  { id: "carta", label: "Hoja carta", note: "Documentos", page: "letter", width: "180mm" },
];

// Abre el diálogo de impresión con una página de prueba en el formato elegido.
function printTest(p: (typeof PRINTERS)[number]) {
  const w = window.open("", "_blank", "width=480,height=640");
  if (!w) {
    toast.error("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e inténtalo de nuevo.");
    return;
  }
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Prueba de impresión</title>
    <style>@page{size:${p.page};margin:4mm}body{font-family:system-ui,sans-serif;width:${p.width};margin:0 auto}
    h1{font-size:16px;margin:8px 0}p{font-size:12px;margin:4px 0}.box{border:1px dashed #000;padding:6px;margin-top:8px;text-align:center}</style></head>
    <body><h1>Prueba de impresión</h1><p>Formato: ${p.label}</p><p>${new Date().toLocaleString("es-VE")}</p>
    <div class="box">Si ves este recuadro completo, tu impresora está bien configurada.</div></body></html>`
  );
  w.document.close();
  w.focus();
  w.print();
}

export function DataPanel({ initialEmails }: { initialEmails: string[] }) {
  const online = useOnlineStatus();
  const [pending, setPending] = useState<number | null>(null);
  const [emails, setEmails] = useState(initialEmails.join(", "));
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
    <div className="flex max-w-2xl flex-col gap-5">
      <section className="flex flex-col gap-2 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
        <h3 className="font-bold">Impresoras</h3>
        <ul className="flex flex-col gap-2">
          {PRINTERS.map((p) => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{p.label}</span> <span className="text-muted-foreground">· {p.note}</span>
              </span>
              <Button size="sm" variant="outline" onClick={() => printTest(p)}>
                Imprimir prueba
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
        <h3 className="font-bold">Exportaciones a Excel</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => exportSheet("cobros")}>
            Respaldo de cobros
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => exportSheet("ventas")}>
            Historial de ventas
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
        <h3 className="font-bold">Reporte diario por correo</h3>
        <p className="text-sm text-muted-foreground">
          Hasta 5 correos separados por coma. Se envía cada noche con las ventas del día, junto con la actualización de la tasa.
        </p>
        <Input
          aria-label="Correos del reporte diario"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="dueno@correo.com, contador@correo.com"
        />
        <div className="flex gap-2">
          <Button disabled={busy} onClick={save}>
            Guardar
          </Button>
          <Button variant="outline" disabled={busy} onClick={test}>
            Enviar prueba
          </Button>
        </div>
      </section>

      <section className="flex items-center gap-3 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
        <span className={`size-3 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
        <div className="text-sm">
          <p className="font-bold">Modo sin internet</p>
          <p className="text-muted-foreground">
            {online ? "Conectado." : "Sin conexión: las ventas se guardan en este equipo."}{" "}
            {pending === null ? "" : pending === 0 ? "No hay ventas pendientes por sincronizar." : `${pending} ${pending === 1 ? "venta pendiente" : "ventas pendientes"} por sincronizar.`}
          </p>
        </div>
      </section>
    </div>
  );
}
