import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Ruta de salud para el monitoreo externo (Uptime Kuma, Better Stack, etc.).
// Responde 200 si la app y la base de datos contestan, y 503 si no. No expone
// detalles internos ni datos de ninguna empresa.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
