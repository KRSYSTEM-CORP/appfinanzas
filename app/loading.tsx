// Esqueleto instantáneo al cambiar de módulo: la barra lateral ya está y el contenido
// aparece al momento mientras el servidor termina de cargar los datos.
export default function Loading() {
  return (
    <div className="flex flex-col gap-3.5 p-4 md:p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="h-8 w-48 animate-pulse rounded-xl bg-muted" />
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-[19px] bg-muted" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-[19px] bg-muted" />
    </div>
  );
}
