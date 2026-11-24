import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div>
        <h2 className="text-lg font-semibold">Página no encontrada</h2>
        <p className="mt-1 text-sm text-muted-foreground">La página que buscas no existe o fue movida.</p>
      </div>
      <Link href="/home" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Ir al inicio
      </Link>
    </div>
  );
}
