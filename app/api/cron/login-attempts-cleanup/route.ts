import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Limpieza diaria de LoginAttempt: los intentos solo cuentan dentro de su ventana
// (minutos u horas), así que los de más de 2 días ya no sirven para nada.
const RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { count } = await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
  });
  return NextResponse.json({ ok: true, deleted: count });
}
