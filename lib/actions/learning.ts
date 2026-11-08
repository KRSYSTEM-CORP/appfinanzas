"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { LEARNING_ADMIN_EMAIL, MAX_LEARNING_VIDEOS, isHttpsUrl } from "@/lib/learning";
import type { ActionResult } from "@/lib/types";

export type LearningVideoRow = { id: string; title: string; description: string | null; url: string; position: number };

// Cualquier usuario autenticado ve los videos.
export async function listLearningVideos(): Promise<LearningVideoRow[]> {
  await requireSession();
  return prisma.learningVideo.findMany({
    orderBy: { position: "asc" },
    select: { id: true, title: true, description: true, url: true, position: true },
  });
}

// Solo el super admin cuyo correo es LEARNING_ADMIN_EMAIL.
export async function isLearningAdmin(): Promise<boolean> {
  const session = await requireSession();
  if (!session.isSuperAdmin) return false;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  return user?.email.toLowerCase() === LEARNING_ADMIN_EMAIL;
}

const VideoSchema = z.object({
  title: z.string().trim().min(2, "Escribe el título").max(120),
  description: z.string().trim().max(300).optional(),
  url: z.string().trim().refine(isHttpsUrl, "El enlace debe empezar con https://"),
});

export async function addLearningVideo(input: unknown): Promise<ActionResult> {
  if (!(await isLearningAdmin())) return { success: false, error: "No tienes permiso para subir videos" };
  const parsed = VideoSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const count = await prisma.learningVideo.count();
  if (count >= MAX_LEARNING_VIDEOS) {
    return { success: false, error: `Ya hay ${MAX_LEARNING_VIDEOS} videos. Quita uno para agregar otro.` };
  }
  const last = await prisma.learningVideo.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
  await prisma.learningVideo.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      url: parsed.data.url,
      position: (last?.position ?? 0) + 1,
    },
  });
  revalidatePath("/learning");
  return { success: true };
}

export async function deleteLearningVideo(id: string): Promise<ActionResult> {
  if (!(await isLearningAdmin())) return { success: false, error: "No tienes permiso para quitar videos" };
  await prisma.learningVideo.deleteMany({ where: { id } });
  revalidatePath("/learning");
  return { success: true };
}
