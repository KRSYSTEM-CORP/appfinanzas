import "server-only";
import { Prisma } from "@prisma/client";

// Lecturas SQL agrupadas. Una pantalla de estadísticas lanza decenas de agregados independientes y
// cada uno era un viaje a la base. Aquí las consultas que se piden en el mismo «turno» del bucle de
// eventos sobre la MISMA transacción se juntan en UNA sola sentencia:
//
//   SELECT (SELECT COALESCE(json_agg(t), '[]') FROM (<consulta 0>) t) AS r0,
//          (SELECT COALESCE(json_agg(t), '[]') FROM (<consulta 1>) t) AS r1 ...
//
// Cada subconsulta es exactamente la consulta original (mismos filtros, misma empresa y mismo RLS,
// porque corre dentro de la transacción con el set_config de la empresa), así que las cifras no
// cambian. Las filas vuelven como JSON: bigint y numeric llegan como número, fecha como texto
// «YYYY-MM-DD» y timestamp como texto sin zona (UTC); usa `jsDate()` para volver a Date.

type Tx = Prisma.TransactionClient;
type Pending = { sql: Prisma.Sql; resolve: (rows: unknown[]) => void; reject: (e: unknown) => void };

const queues = new WeakMap<object, Pending[]>();

function enqueue<T>(tx: Tx, sql: Prisma.Sql): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    let q = queues.get(tx);
    if (!q) {
      q = [];
      queues.set(tx, q);
    }
    q.push({ sql, resolve: resolve as (rows: unknown[]) => void, reject });
    if (q.length === 1) setImmediate(() => void flush(tx));
  });
}

async function flush(tx: Tx): Promise<void> {
  const batch = queues.get(tx);
  if (!batch || batch.length === 0) return;
  queues.delete(tx);
  const parts = batch.map((p, i) => Prisma.sql`(SELECT COALESCE(json_agg(t), '[]'::json) FROM (${p.sql}) t) AS ${Prisma.raw(`r${i}`)}`);
  try {
    const [row] = await tx.$queryRaw<Record<string, unknown>[]>(Prisma.sql`SELECT ${Prisma.join(parts, ", ")}`);
    batch.forEach((p, i) => p.resolve((row?.[`r${i}`] as unknown[]) ?? []));
  } catch (e) {
    batch.forEach((p) => p.reject(e));
  }
}

/** Como tx.$queryRaw`...`, pero agrupada con las demás consultas del mismo turno. T es el tipo de UNA fila. */
export function bq<T = Record<string, unknown>>(tx: Tx) {
  return (strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => enqueue<T>(tx, Prisma.sql(strings, ...values));
}

export function bqSql<T = Record<string, unknown>>(tx: Tx, sql: Prisma.Sql): Promise<T[]> {
  return enqueue<T>(tx, sql);
}

/** Texto de timestamp/timestamptz de Postgres (en JSON) a Date; sin zona se lee como UTC, igual que Prisma. */
export function jsDate(v: string): Date {
  return new Date(/(Z|[+-]\d\d(:?\d\d)?)$/.test(v) ? v : `${v}Z`);
}

/** Fecha «YYYY-MM-DD» (columna date) a Date en medianoche UTC, como la entrega Prisma. */
export function jsDateOnly(v: string): Date {
  return new Date(`${v.slice(0, 10)}T00:00:00.000Z`);
}
