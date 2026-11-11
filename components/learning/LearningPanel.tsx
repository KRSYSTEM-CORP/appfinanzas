"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, EyeIcon, EyeOffIcon, ExternalLinkIcon, FileTextIcon, StarIcon, UsersIcon, XIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  addLearningVideo,
  deleteLearningVideo,
  getLearningUploadUrl,
  moveLearningVideo,
  setLearningPublished,
  setLearningWatched,
  type LearningStats,
  type LearningVideoRow,
} from "@/lib/actions/learning";
import { LEARNING_AUDIENCES, videoEmbed } from "@/lib/learning";

export function LearningPanel({
  videos: allVideos,
  stats,
  isAdmin,
  storageReady,
  max,
  maxUploadMb,
}: {
  videos: LearningVideoRow[];
  stats: LearningStats | null;
  isAdmin: boolean;
  storageReady: boolean;
  max: number;
  maxUploadMb: number;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<string>("Todo");
  const [published, setPublished] = useState(true);
  const [learnsText, setLearnsText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [route, setRoute] = useState<string>("Todo");
  const videos = allVideos.filter((v) => route === "Todo" || v.audience === "Todo" || v.audience === route);
  const watchedCount = videos.filter((v) => v.watched).length;
  const pct = videos.length > 0 ? Math.round((watchedCount / videos.length) * 100) : 0;
  const [currentId, setCurrentId] = useState<string | null>(null);
  const currentIndex = Math.max(0, videos.findIndex((v) => v.id === currentId));
  const current = videos[currentIndex] ?? videos[0];
  const uploading = progress !== null;

  function reset() {
    setTitle("");
    setDescription("");
    setAudience("Todo");
    setPublished(true);
    setLearnsText("");
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
        const added = await addLearningVideo({ title, description, r2Key: grant.key, audience: audience as (typeof LEARNING_AUDIENCES)[number], published, learns: learnsText.split("\n").map((l) => l.trim()).filter(Boolean) });
        if (!added.success) throw new Error(added.error);
      } else {
        const added = await addLearningVideo({ title, description, url, audience: audience as (typeof LEARNING_AUDIENCES)[number], published, learns: learnsText.split("\n").map((l) => l.trim()).filter(Boolean) });
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
                    {v.learns.length > 0 && (
                      <div className="mt-4">
                        <p className="kr-eyebrow mb-2">Lo que aprendes</p>
                        <ul className="flex flex-col gap-1.5">
                          {v.learns.map((l) => (
                            <li key={l} className="flex items-start gap-2 text-sm">
                              <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {l}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant={v.watched ? "outline" : "default"} disabled={isPending} onClick={() => toggleWatched(v)}>
                        {v.watched ? "Marcar como no visto" : "Marcar como visto"}
                      </Button>
                      <Link href="/pos" className={buttonVariants({ size: "sm", variant: "outline" })}>
                        Practicar en mi sistema
                      </Link>
                      <Link href="/assistant" className={buttonVariants({ size: "sm", variant: "outline" })}>
                        Preguntar al Asistente IA
                      </Link>
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
            <div className="flex flex-wrap gap-2">
              {LEARNING_AUDIENCES.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={route === a}
                  onClick={() => setRoute(a)}
                  className={`min-h-[38px] rounded-xl border-2 px-3.5 text-[13px] font-bold transition-colors ${
                    route === a ? "border-primary bg-primary/12 text-primary" : "border-transparent bg-muted text-foreground hover:bg-muted/70"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
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

      {isAdmin && stats && (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          {[
            { label: "Módulos", value: String(stats.modules), sub: `${stats.published} publicados · ${stats.modules - stats.published} ocultos`, Icon: FileTextIcon, chip: "bg-primary/12 text-primary" },
            { label: "Empresas que aprenden", value: String(stats.companies), sub: "con al menos un video visto", Icon: UsersIcon, chip: "bg-success/14 text-success" },
            { label: "Finalización promedio", value: `${stats.avgCompletionPct} %`, sub: "de quienes ya empezaron", Icon: StarIcon, chip: "bg-warning/18 text-warning" },
          ].map((k) => (
            <div key={k.label} className="relative min-h-32 rounded-[19px] bg-card p-[17px] shadow-(--shadow-card)">
              <p className="pr-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</p>
              <span className={`absolute right-4 top-4 grid size-[34px] place-items-center rounded-full ${k.chip}`} aria-hidden>
                <k.Icon className="size-[18px]" />
              </span>
              <p className="mt-1.5 text-[34px] font-extrabold leading-[1.1] tracking-[-0.03em] tabular-nums">{k.value}</p>
              <p className="mt-1.5 text-[13px] text-muted-foreground">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      {isAdmin && allVideos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Biblioteca</CardTitle>
            <p className="text-sm text-muted-foreground">Ordena, oculta o elimina</p>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {allVideos.map((v, i) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-bold">
                      {i + 1}. {v.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v.audience} · {v.published ? "Publicado" : "Oculto"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" size="icon-sm" variant="ghost" disabled={isPending || i === 0} aria-label="Subir" onClick={() => startTransition(async () => { await moveLearningVideo(v.id, "up"); router.refresh(); })}>
                      <ArrowUpIcon />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" disabled={isPending || i === allVideos.length - 1} aria-label="Bajar" onClick={() => startTransition(async () => { await moveLearningVideo(v.id, "down"); router.refresh(); })}>
                      <ArrowDownIcon />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" disabled={isPending} aria-label={v.published ? "Ocultar" : "Publicar"} onClick={() => startTransition(async () => { await setLearningPublished(v.id, !v.published); router.refresh(); })}>
                      {v.published ? <EyeIcon /> : <EyeOffIcon />}
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" disabled={isPending} aria-label="Quitar" onClick={() => remove(v)}>
                      <XIcon />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lv-aud">Ruta sugerida</Label>
                  <select id="lv-aud" value={audience} onChange={(e) => setAudience(e.target.value)} className="h-11 rounded-[14px] border-[1.5px] border-input bg-transparent px-3 text-sm md:h-[50px]">
                    {LEARNING_AUDIENCES.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lv-pub">Estado</Label>
                  <select id="lv-pub" value={published ? "1" : "0"} onChange={(e) => setPublished(e.target.value === "1")} className="h-11 rounded-[14px] border-[1.5px] border-input bg-transparent px-3 text-sm md:h-[50px]">
                    <option value="1">Publicado</option>
                    <option value="0">Oculto</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lv-learns">Lo que aprendes (una línea por punto)</Label>
                <textarea id="lv-learns" rows={3} value={learnsText} onChange={(e) => setLearnsText(e.target.value)} className="rounded-[14px] border-[1.5px] border-input bg-transparent px-3 py-2 text-sm" placeholder={"Abre la caja\nGenera el Corte Z"} />
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
