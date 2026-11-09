"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  addLearningVideo,
  deleteLearningVideo,
  getLearningUploadUrl,
  setLearningWatched,
  type LearningVideoRow,
} from "@/lib/actions/learning";
import { videoEmbed } from "@/lib/learning";

export function LearningPanel({
  videos,
  isAdmin,
  storageReady,
  max,
  maxUploadMb,
}: {
  videos: LearningVideoRow[];
  isAdmin: boolean;
  storageReady: boolean;
  max: number;
  maxUploadMb: number;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const watchedCount = videos.filter((v) => v.watched).length;
  const pct = videos.length > 0 ? Math.round((watchedCount / videos.length) * 100) : 0;
  const [currentId, setCurrentId] = useState<string | null>(null);
  const currentIndex = Math.max(0, videos.findIndex((v) => v.id === currentId));
  const current = videos[currentIndex] ?? videos[0];
  const uploading = progress !== null;

  function reset() {
    setTitle("");
    setDescription("");
    setUrl("");
    setFile(null);
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // Sube el MP4 directo a R2 con una URL de un solo uso y muestra el avance.
  function putFile(uploadUrl: string, f: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`R2 respondió ${xhr.status}`)));
      xhr.onerror = () => reject(new Error("No se pudo subir el archivo (revisa la configuración CORS del bucket)"));
      xhr.send(f);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (file) {
        setProgress(0);
        const grant = await getLearningUploadUrl({ size: file.size, contentType: file.type });
        if (!grant.success) throw new Error(grant.error);
        await putFile(grant.uploadUrl, file);
        const added = await addLearningVideo({ title, description, r2Key: grant.key });
        if (!added.success) throw new Error(added.error);
      } else {
        const added = await addLearningVideo({ title, description, url });
        if (!added.success) throw new Error(added.error);
      }
      reset();
      router.refresh();
    } catch (err) {
      setProgress(null);
      setError(err instanceof Error ? err.message : "No se pudo agregar el video");
    }
  }

  function remove(v: LearningVideoRow) {
    if (!window.confirm(`¿Quitar el video «${v.title}»?`)) return;
    startTransition(async () => {
      await deleteLearningVideo(v.id);
      router.refresh();
    });
  }

  function toggleWatched(v: LearningVideoRow) {
    startTransition(async () => {
      await setLearningWatched(v.id, !v.watched);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {videos.length === 0 ? (
        <p className="rounded-[20px] border border-dashed p-5 text-sm text-muted-foreground">
          Todavía no hay videos. Pronto agregaremos guías paso a paso.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className="flex min-w-0 flex-col gap-4">
            {(() => {
              const v = current;
              const embed = v.url ? videoEmbed(v.url) : null;
              return (
                <>
                  <div className="overflow-hidden rounded-[22px] bg-black shadow-(--shadow-float)">
                    {v.playUrl ? (
                      <video
                        key={v.id}
                        src={v.playUrl}
                        controls
                        preload="metadata"
                        playsInline
                        className="aspect-video w-full bg-black"
                        onEnded={() => !v.watched && toggleWatched(v)}
                      />
                    ) : embed ? (
                      <div className="aspect-video">
                        <iframe
                          key={v.id}
                          src={embed.embedUrl}
                          title={v.title}
                          loading="lazy"
                          className="size-full"
                          allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
                          allowFullScreen
                          referrerPolicy="strict-origin-when-cross-origin"
                        />
                      </div>
                    ) : (
                      <div className="grid aspect-video place-items-center p-6 text-center text-sm text-white/80">
                        {v.url ? (
                          <a href={v.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-2">
                            Ver el video <ExternalLinkIcon className="size-3.5" />
                          </a>
                        ) : (
                          "Este video no está disponible por ahora."
                        )}
                      </div>
                    )}
                  </div>
                  <div className="rounded-[20px] bg-card p-5 shadow-(--shadow-card)">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Módulo {currentIndex + 1} de {videos.length}
                    </p>
                    <h2 className="mt-1 text-xl font-bold tracking-tight">{v.title}</h2>
                    {v.description && <p className="mt-1 text-sm text-muted-foreground">{v.description}</p>}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant={v.watched ? "outline" : "default"} disabled={isPending} onClick={() => toggleWatched(v)}>
                        {v.watched ? "Marcar como no visto" : "Marcar como visto"}
                      </Button>
                      {isAdmin && (
                        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => remove(v)}>
                          Quitar
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </section>

          <aside className="flex min-w-0 flex-col gap-4 rounded-[20px] bg-card p-5 shadow-(--shadow-card)" aria-live="polite">
            <div className="flex items-center gap-4">
              <div
                className="grid size-16 shrink-0 place-items-center rounded-full"
                style={{ background: `conic-gradient(var(--primary) ${pct * 3.6}deg, var(--muted) 0)` }}
                role="progressbar"
                aria-valuenow={watchedCount}
                aria-valuemin={0}
                aria-valuemax={videos.length}
              >
                <span className="grid size-12 place-items-center rounded-full bg-card text-sm font-bold tabular-nums">{pct} %</span>
              </div>
              <p className="text-sm text-muted-foreground">
                <b className="text-foreground">{watchedCount}</b> de {videos.length} videos completados
              </p>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tu ruta</p>
            <ol className="flex flex-col gap-2">
              {videos.map((v, i) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => setCurrentId(v.id)}
                    aria-current={v.id === current.id}
                    className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors ${
                      v.id === current.id ? "bg-primary/10 ring-2 ring-primary" : "bg-muted hover:bg-muted/70"
                    }`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-card text-sm font-bold">
                      {v.watched ? <CheckIcon className="size-4 text-success" aria-label="Visto" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Módulo {i + 1}</span>
                      <span className="block truncate text-sm font-semibold">{v.title}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>
              Agregar video ({videos.length} de {max})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lv-title">Título</Label>
                <Input id="lv-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lv-file">Archivo MP4 (hasta {maxUploadMb} MB)</Label>
                <Input
                  id="lv-file"
                  ref={fileRef}
                  type="file"
                  accept="video/mp4"
                  disabled={!storageReady || uploading}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {!storageReady && (
                  <p className="text-xs text-muted-foreground">
                    La subida de archivos se activa cuando se configura el almacenamiento (R2). Mientras tanto puedes usar un enlace.
                  </p>
                )}
              </div>
              {!file && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lv-url">…o un enlace (YouTube o Vimeo, https://…)</Label>
                  <Input id="lv-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/…" />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lv-desc">Descripción (opcional)</Label>
                <Input id="lv-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              {uploading && (
                <div className="flex flex-col gap-1" aria-live="polite">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">Subiendo… {progress} %</p>
                </div>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div>
                <Button type="submit" disabled={uploading || videos.length >= max || title.trim().length < 2 || (!file && !url)}>
                  {file ? "Subir video" : "Agregar video"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
