import { NextResponse, type NextRequest } from "next/server";
import { withSuperAdmin } from "@/lib/tenant-db";
import { sendAnnouncementEmail } from "@/lib/email";

// Runs monthly (see vercel.json's "crons" entry) and checks the database's
// total size against ALERT_THRESHOLD_BYTES. Only emails the super admins
// when that threshold is actually crossed — a normal month is silent, not
// another inbox notification. Exists specifically to keep an eye on
// Product.imageDataUrl (product photos stored as base64 directly in
// Postgres, a deliberate choice — see the "Add Supabase Realtime and
// Storage integration" / revert commits) growing unbounded as more
// businesses and products get added, without needing a bigger fix before
// there's an actual number to react to.
const ALERT_THRESHOLD_BYTES = 100 * 1024 * 1024; // 100 MB

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ bytes }] = await withSuperAdmin((tx) =>
    tx.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`
  );
  const sizeBytes = Number(bytes);
  const sizeMb = Math.round((sizeBytes / (1024 * 1024)) * 10) / 10;

  if (sizeBytes < ALERT_THRESHOLD_BYTES) {
    return NextResponse.json({ ok: true, sizeMb, alerted: false });
  }

  const admins = await withSuperAdmin((tx) => tx.user.findMany({ where: { isSuperAdmin: true }, select: { email: true } }));
  await Promise.allSettled(
    admins.map((a) =>
      sendAnnouncementEmail(
        a.email,
        `Base de datos de KR POS: ${sizeMb} MB`,
        `La base de datos de KR POS llegó a ${sizeMb} MB, por encima del umbral de aviso (${Math.round(ALERT_THRESHOLD_BYTES / (1024 * 1024))} MB).\n\nVale la pena revisar qué está creciendo (ej. imágenes de productos) y decidir si conviene moverlas a un almacenamiento aparte, con el número real en la mano en vez de por adelantado.`
      )
    )
  );

  return NextResponse.json({ ok: true, sizeMb, alerted: true, notified: admins.length });
}
