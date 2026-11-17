// Reglas del Directorio de clientes del POS (puras, para poder probarlas).

export const DIRECTORY_PAGE_SIZE = 30;

// Filtro de búsqueda del directorio: sin texto devuelve TODOS los clientes de la
// empresa; con texto busca por nombre, apellido, "nombre apellido", teléfono o cédula.
export function directorySearchFilter(query?: string) {
  const q = query?.trim() ?? "";
  if (!q) return {};
  const or: object[] = [
    { firstName: { contains: q, mode: "insensitive" } },
    { lastName: { contains: q, mode: "insensitive" } },
    { phone: { contains: q } },
    { rif: { contains: q, mode: "insensitive" } },
  ];
  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    or.push({
      AND: parts.map((p) => ({
        OR: [
          { firstName: { contains: p, mode: "insensitive" } },
          { lastName: { contains: p, mode: "insensitive" } },
        ],
      })),
    });
  }
  return { OR: or };
}

// Pide una fila de más para saber si quedan páginas sin hacer un count.
export function paginate<T>(rows: T[], pageSize = DIRECTORY_PAGE_SIZE) {
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
}
