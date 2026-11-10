"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  LEARNING_ADMIN_EMAIL,
  LEARNING_KEY_REGEX,
  MAX_LEARNING_UPLOAD_BYTES,
  MAX_LEARNING_VIDEOS,
  isHttpsUrl,
  LEARNING_AUDIENCES,
} from "@/lib/learning";
import { r2Config, r2Delete, r2ReadUrl, r2UploadUrl } from "@/lib/r2";
import type { ActionResult } from "@/lib/types";

export type LearningVideoRow = {
  id: string;
  title: string;
  description: string | null;
  // Enlace externo (YouTube/Vimeo), o null si el video es un MP4 de R2.
  url: string | null;
  // URL temporal para reproducir el MP4 de R2 (caduca), o null.
  playUrl: string | null;
  position: number;
  watched: boolean;
  audience: string;
  published: boolean;
  learns: string[];
};

export async function isLearningStorageReady(): Promise<boolean> {
  return r2Config() != null;
}

// Cualquier usuario autenticado ve los videos y su propio avance.
export async function listLearningVideos(): Promise<LearningVideoRow[]> {
  const { userId } = await requireSession();
  const admin = await isLearningAdmin();
  const [videos, progress] = await Promise.all([
    prisma.learningVideo.findMany({ where: admin ? {} : { published: true }, orderBy: { position: "asc" } }),
    prisma.learningProgress.findMany({ where: { userId }, select: { videoId: true } }),
  ]);
  const seen = new Set(progress.map((p) => p.videoId));
  const ready = r2Config() != null;
  return videos.map((v) => ({
    id: v.id,
    title: v.title,
    description: v.description,
    url: v.url,
    playUrl: v.r2Key && ready ? r2ReadUrl(v.r2Key) : null,
    position: v.position,
    watched: seen.has(v.id),
    audience: v.audience,
    published: v.published,
    learns: v.learns,
  }));
}

// Solo el super admin cuyo correo es LEARNING_ADMIN_EMAIL.
export async function isLearningAdmin(): Promise<boolean> {
  const session = await requireSession();
  if (!session.isSuperAdmin) return false;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  return user?.email.toLowerCase() === LEARNING_ADMIN_EMAIL;
}

// Paso 1 de la subida: el admin pide permiso y recibe una URL de un solo uso para
// mandar el MP4 directo a R2 (sin pasar por el servidor de la app).
export async function getLearningUploadUrl(input: {
  size: number;
  contentType: string;
}): Promise<{ success: true; key: string; uploadUrl: string } | { success: false; error: string }> {
  if (!(await isLearningAdmin())) return { success: false, error: "No tienes permiso para subir videos" };
  if (!r2Config()) return { success: false, error: "El almacenamiento de videos todavía no está configurado." };
  if (input.contentType !== "video/mp4") return { success: false, error: "Solo se aceptan videos MP4" };
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > MAX_LEARNING_UPLOAD_BYTES) {
    return { success: false, error: `El video debe pesar menos de ${MAX_LEARNING_UPLOAD_BYTES / 1024 / 1024} MB` };
  }
  const count = await prisma.learningVideo.count();
  if (count >= MAX_LEARNING_VIDEOS) {
    return { success: false, error: `Ya hay ${MAX_LEARNING_VIDEOS} videos. Quita uno para agregar otro.` };
  }
  const key = `learning/${Date.now()}-${randomBytes(8).toString("hex")}.mp4`;
  return { success: true, key, uploadUrl: r2UploadUrl(key) };
}

const VideoSchema = z
  .object({
    title: z.string().trim().min(2, "Escribe el título").max(120),
    description: z.string().trim().max(300).optional(),
    url: z.string().trim().refine(isHttpsUrl, "El enlace debe empezar con https://").optional(),
    r2Key: z.string().regex(LEARNING_KEY_REGEX, "Archivo inválido").optional(),
    audience: z.enum(LEARNING_AUDIENCES).optional(),
    published: z.boolean().optional(),
    learns: z.array(z.string().trim().min(1).max(140)).max(8).optional(),
  })
  .refine((v) => Boolean(v.url) !== Boolean(v.r2Key), "Indica un enlace o sube un archivo MP4");

// Paso 2: registrar el video (ya subido a R2, o un enlace de YouTube/Vimeo).
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
      url: parsed.data.url ?? null,
      r2Key: parsed.data.r2Key ?? null,
      position: (last?.position ?? 0) + 1,
      audience: parsed.data.audience ?? "Todo",
      published: parsed.data.published ?? true,
      learns: parsed.data.learns ?? [],
    },
  });
  revalidatePath("/learning");
  return { success: true };
}

export async function deleteLearningVideo(id: string): Promise<ActionResult> {
  if (!(await isLearningAdmin())) return { success: false, error: "No tienes permiso para quitar videos" };
  const video = await prisma.learningVideo.findUnique({ where: { id }, select: { r2Key: true } });
  await prisma.learningVideo.deleteMany({ where: { id } });
  await prisma.learningProgress.deleteMany({ where: { videoId: id } });
  if (video?.r2Key && r2Config()) {
    try {
      await r2Delete(video.r2Key);
    } catch {
      // El video ya no está en la lista; si el archivo quedó huérfano, se puede borrar luego desde Cloudflare.
    }
  }
  revalidatePath("/learning");
  return { success: true };
}

// Avance personal: marcar o desmarcar un video como visto.
export async function setLearningWatched(videoId: string, watched: boolean): Promise<ActionResult> {
  const { userId } = await requireSession();
  const exists = await prisma.learningVideo.findUnique({ where: { id: videoId }, select: { id: true } });
  if (!exists) return { success: false, error: "Video no encontrado" };
  if (watched) {
    await prisma.learningProgress.upsert({
      where: { userId_videoId: { userId, videoId } },
      create: { userId, videoId },
      update: {},
    });
  } else {
    await prisma.learningProgress.deleteMany({ where: { userId, videoId } });
  }
  revalidatePath("/learning");
  return { success: true };
}

// Biblioteca del administrador: subir o bajar un video en el orden.
export async function moveLearningVideo(id: string, direction: "up" | "down"): Promise<ActionResult> {
  if (!(await isLearningAdmin())) return { success: false, error: "No tienes permiso" };
  const all = await prisma.learningVideo.findMany({ orderBy: { position: "asc" }, select: { id: true, position: true } });
  const i = all.findIndex((v) => v.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= all.length) return { success: true };
  await prisma.$transaction([
    prisma.learningVideo.update({ where: { id: all[i].id }, data: { position: all[j].position } }),
    prisma.learningVideo.update({ where: { id: all[j].id }, data: { position: all[i].position } }),
  ]);
  revalidatePath("/learning");
  return { success: true };
}

// Publicar u ocultar un video (los ocultos solo los ve el administrador).
export async function setLearningPublished(id: string, published: boolean): Promise<ActionResult> {
  if (!(await isLearningAdmin())) return { success: false, error: "No tienes permiso" };
  await prisma.learningVideo.updateMany({ where: { id }, data: { published } });
  revalidatePath("/learning");
  return { success: true };
}

export type LearningStats = { modules: number; published: number; companies: number; avgCompletionPct: number };

// Resumen para el administrador: módulos, empresas que ya aprenden y avance promedio.
export async function getLearningStats(): Promise<LearningStats | null> {
  if (!(await isLearningAdmin())) return null;
  const [videos, progress] = await Promise.all([
    prisma.learningVideo.findMany({ select: { id: true, published: true } }),
    prisma.learningProgress.findMany({ select: { userId: true, videoId: true } }),
  ]);
  const publishedIds = new Set(videos.filter((v) => v.published).map((v) => v.id));
  const perUser = new Map<string, number>();
  for (const p of progress) if (publishedIds.has(p.videoId)) perUser.set(p.userId, (perUser.get(p.userId) ?? 0) + 1);
  const userIds = [...perUser.keys()];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, companyId: true } }) : [];
  const companies = new Set(users.map((u) => u.companyId));
  const avg = perUser.size && publishedIds.size ? [...perUser.values()].reduce((a, n) => a + n / publishedIds.size, 0) / perUser.size : 0;
  return { modules: videos.length, published: publishedIds.size, companies: companies.size, avgCompletionPct: Math.round(avg * 100) };
}
