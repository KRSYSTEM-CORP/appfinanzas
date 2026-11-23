// Abre el sitio de un banco en una ventana propia de KR POS. Los bancos prohíben incrustar su página dentro de
// otra (y no debe pedirse ahí la clave), así que no se usa un marco: en la app instalada se abre el navegador
// integrado del teléfono (plugin Browser de Capacitor, si está en la app) y en la web, una ventana aparte con
// forma de teléfono.
type CapacitorWindow = { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Browser?: { open: (o: { url: string }) => Promise<void> } } } };

export async function openBankSite(url: string): Promise<boolean> {
  const cap = (window as unknown as CapacitorWindow).Capacitor;
  const native = cap?.isNativePlatform?.() && cap.Plugins?.Browser;
  if (native) {
    try {
      await native.open({ url });
      return true;
    } catch {
      // Cae a la ventana normal.
    }
  }
  const w = window.open(url, "kr-banco", "popup=yes,width=520,height=820");
  if (!w) return false;
  try {
    w.opener = null;
  } catch {
    // Sin acceso: no pasa nada.
  }
  w.focus();
  return true;
}
