// Shown instantly inside the app shell while a section's server data loads,
// so a tap on the menu responds right away instead of looking frozen.
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
