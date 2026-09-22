"use client";

import { useSyncExternalStore } from "react";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useInstallApp } from "@/lib/use-install-app";

const noopSubscribe = () => () => {};

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 text-xs break-all">{children}</code>;
}

function Steps({ title, steps }: { title: string; steps: React.ReactNode[] }) {
  return (
    <div className="rounded-lg border p-4 flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ol className="list-decimal list-inside flex flex-col gap-1.5 text-sm text-muted-foreground">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

// Instalar la app y dejar la impresión térmica en un clic. Todo aquí es
// configuración del equipo del cliente (navegador/sistema), no del sistema:
// KR POS siempre corre conectado a internet y se actualiza solo con cada
// despliegue, así que no hay nada que "actualizar" en la app instalada.
export function AppInstallGuide() {
  const { canInstall, isInstalled, install } = useInstallApp();
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Instalar KR POS en este equipo</h2>
          {isInstalled && <Badge variant="success">Instalada</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          Se abre en su propia ventana, con su icono en el escritorio o la barra de tareas, y se
          mantiene actualizada sola: siempre usa internet y muestra la última versión de tu sistema.
        </p>
        {canInstall && (
          <Button type="button" className="w-fit" onClick={install}>
            <DownloadIcon />
            Instalar KR POS
          </Button>
        )}
        {!isInstalled && !canInstall && (
          <p className="text-sm text-muted-foreground">
            Si no aparece el botón, instálala desde el navegador: en <strong>Chrome o Edge</strong>,
            el icono de instalar en la barra de direcciones (o menú → «Instalar KR POS»); en{" "}
            <strong>Safari (Mac)</strong>, Compartir → «Añadir al Dock».
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Imprimir el ticket directo, sin diálogo</h2>
        <p className="text-sm text-muted-foreground">
          Por defecto el navegador muestra su ventana de impresión en cada ticket. Para que salga
          directo en la impresora térmica, deja la impresora como predeterminada del sistema y abre
          la app con el modo de impresión directa. Es opcional, se hace una vez por equipo y solo
          funciona con Chrome o Edge. Pruébalo con tu impresora: el resultado depende de su driver.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Steps
            title="Windows"
            steps={[
              "Instala la impresora con su driver y márcala como «Impresora predeterminada» (Configuración → Bluetooth y dispositivos → Impresoras).",
              "Cierra la app por completo. En el acceso directo de KR POS, clic derecho → Propiedades.",
              <>
                En el campo «Destino», al final del texto, agrega un espacio y <Code>--kiosk-printing</Code>. Aceptar.
              </>,
              "Abre KR POS siempre desde ese acceso directo. Los tickets saldrán directo, con el tamaño de papel que configures en la pestaña «Impresión».",
            ]}
          />
          <Steps
            title="Mac"
            steps={[
              "Instala la impresora y márcala como predeterminada (Ajustes del Sistema → Impresoras y escáneres).",
              "Cierra Chrome por completo (Cmd+Q); si sigue abierto ignora el modo directo.",
              <>
                En Terminal, ejecuta: <Code>{`open -a "Google Chrome" --args --kiosk-printing --app=${origin}`}</Code>
              </>,
              "Para no repetirlo, guarda ese comando como app con la aplicación Atajos o Automator y ábrela desde el Dock.",
            ]}
          />
        </div>

        <p className="text-sm text-muted-foreground">
          Sin este modo todo sigue funcionando: solo tendrás que confirmar en el diálogo de
          impresión cada vez. Las notas y presupuestos en Carta o A4 se imprimen como PDF.
        </p>
      </div>
    </div>
  );
}
