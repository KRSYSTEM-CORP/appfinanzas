// Cabecera de pantalla: eyebrow + título (38,4px en computadora, 28,8px en teléfono) y acciones a la derecha.
export function PageHeader({
  eyebrow,
  title,
  actions,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p data-kr="eyebrow" className="kr-eyebrow">
            {eyebrow}
          </p>
        )}
        <h1 data-kr="h1" className="kr-h1">
          {title}
        </h1>
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
