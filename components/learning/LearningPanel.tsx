"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, AwardIcon, BoxIcon, CheckIcon, LockIcon, SparklesIcon, EyeIcon, EyeOffIcon, ExternalLinkIcon, FileTextIcon, StarIcon, UsersIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { IconTile } from "@/components/ui/icon-tile";
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

const pillSt = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-xs font-bold whitespace-nowrap";
const btnBase = "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-transform active:scale-[0.97] disabled:opacity-50";
const btnPrimary = `${btnBase} bg-primary text-primary-foreground`;
const btnSoft = `${btnBase} bg-muted text-primary`;

export function LearningPanel({
  videos: allVideos,
  stats,
  isAdmin,
  storageReady,
  max,
  maxUploadMb,
  defaultRoute,
}: {
  videos: LearningVideoRow[];
  stats: LearningStats | null;
  isAdmin: boolean;
  storageReady: boolean;
  max: number;
  maxUploadMb: number;
  defaultRoute?: string;
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

  const [route, setRoute] = useState<string>(defaultRoute ?? "Todo");
  const allDone = allVideos.length > 0 && allVideos.every((v) => v.watched);
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
      {isAdmin && (
        <div role="note" className="flex flex-wrap items-center gap-3 rounded-[19px] bg-card px-4 py-3.5 shadow-(--shadow-card)">
          <IconTile>
            <LockIcon className="size-[22px]" aria-hidden />
          </IconTile>
          <div className="min-w-[200px] flex-1">
            <b>Modo administrador de la plataforma</b>
            <p className="text-[13px] text-muted-foreground">Solo este usuario administrador sube y edita los videos. Las demás cuentas solo los ven y completan.</p>
          </div>
        </div>
      )}
      {isAdmin && stats && (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))" }}>
          {[
            { label: "Módulos", value: String(stats.modules), sub: `${stats.published} publicados · ${stats.modules - stats.published} ocultos`, Icon: FileTextIcon, chip: "bg-primary/12 text-primary" },
            { label: "Empresas que aprenden", value: String(stats.companies), sub: "con al menos un video visto", Icon: UsersIcon, chip: "bg-success/14 text-success" },
            { label: "Finalización promedio", value: `${stats.avgCompletionPct} %`, sub: "de quienes ya empezaron", Icon: StarIcon, chip: "bg-warning/18 text-warning" },
          ].map((k) => (
            <div key={k.label} className="relative flex min-h-32 flex-col gap-1.5 rounded-[19px] bg-card p-[17px] shadow-(--shadow-card)">
              <p className="pr-11 text-xs font-semibold uppercase text-muted-foreground">{k.label}</p>
              <span className={`absolute right-3.5 top-3.5 grid size-[34px] place-items-center rounded-full ${k.chip}`} aria-hidden>
                <k.Icon className="size-[18px]" />
              </span>
              <p className="text-[30px] font-bold leading-[1.1] tracking-[-0.03em] tabular-nums">{k.value}</p>
              <p className="text-[13px] text-muted-foreground">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
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
        </div>
      )}
      {videos.length === 0 ? (
        <p className="rounded-[20px] border border-dashed p-5 text-sm text-muted-foreground">
          Todavía no hay videos. Pronto agregaremos guías paso a paso.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
          <section className="flex min-w-0 flex-col gap-3.5">
            {(() => {
              const v = current;
              const embed = v.url ? videoEmbed(v.url) : null;
              return (
                <>
                  <div className="relative overflow-hidden rounded-[22px] bg-[#0b0d17] shadow-(--shadow-float)">
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
                  <section className="relative rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Módulo {currentIndex + 1}{v.watched ? " · Completado" : ""}
                    </p>
                    <h2 className="mb-1 mt-0.5 text-2xl font-bold tracking-[-0.03em]">{v.title}</h2>
                    {v.description && <p className="mb-3 text-muted-foreground">{v.description}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      {v.watched && <span className={`${pillSt} bg-success/14 text-success`}><i className="size-[7px] rounded-full bg-current" />Completado</span>}
                      <button type="button" disabled={isPending} onClick={() => toggleWatched(v)} className={v.watched ? btnSoft : btnPrimary}>
                        <CheckIcon className="size-4" aria-hidden /> {v.watched ? "Marcar como no visto" : "Marcar como visto"}
                      </button>
                      <Link href="/pos" className={btnSoft}>
                        <BoxIcon className="size-4" aria-hidden /> Practicar en mi sistema
                      </Link>
                      <Link href="/assistant" className={btnSoft}>
                        <SparklesIcon className="size-4" aria-hidden /> Preguntar al Asistente IA
                      </Link>
                      {isAdmin && (
                        <button type="button" disabled={isPending} onClick={() => remove(v)} className={btnSoft}>
                          Quitar
                        </button>
                      )}
                    </div>
                    {v.learns.length > 0 && (
                      <>
                        <h3 className="mb-1 mt-4 text-[13px] font-normal uppercase tracking-[0.08em] text-muted-foreground">Lo que aprendes</h3>
                        <ul className="flex flex-col gap-1.5">
                          {v.learns.map((l) => (
                            <li key={l} className="flex gap-2">
                              <CheckIcon className="mt-[3px] size-4 shrink-0 text-success" strokeWidth={3} aria-hidden /> {l}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </section>
                </>
              );
            })()}
          </section>

          <aside className="min-w-0" aria-live="polite">
            <section className="relative rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
              <div className="flex flex-wrap items-center gap-3.5">
                <svg className="size-14" viewBox="0 0 52 52" aria-hidden="true">
                  <circle cx="26" cy="26" r="22" fill="none" stroke="var(--border)" strokeWidth="6" />
                  <circle cx="26" cy="26" r="22" fill="none" stroke="var(--success)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 2 * Math.PI * 22} ${2 * Math.PI * 22}`} transform="rotate(-90 26 26)" />
                </svg>
                <div>
                  <b className="text-[26px] tabular-nums">{pct} %</b>
                  <div className="text-[13px] text-muted-foreground">{watchedCount} de {videos.length} videos completados</div>
                </div>
                {allDone && (
                  <span className={`${pillSt} bg-success/14 text-success`}>
                    <AwardIcon className="size-3.5" aria-hidden />Experto KR POS
                  </span>
                )}
              </div>
              <div className="mt-3.5 grid w-full gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, videos.length)},1fr)` }} role="img" aria-label={`${watchedCount} de ${videos.length} videos completados`}>
                {videos.map((v) => (
                  <i key={v.id} className={`h-2 rounded-full transition-colors duration-200 ${v.watched ? "bg-success" : "bg-border"}`} />
                ))}
              </div>
              <h3 className="mb-1 mt-3 text-[13px] font-normal uppercase tracking-[0.08em] text-muted-foreground">Tu ruta</h3>
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                {LEARNING_AUDIENCES.map((a) => (
                  <Chip key={a} active={route === a} onClick={() => setRoute(a)}>
                    {a}
                  </Chip>
                ))}
              </div>
              <ol className="flex max-h-[560px] flex-col gap-2 overflow-auto">
                {videos.map((v, i) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setCurrentId(v.id)}
                      aria-current={v.id === current.id}
                      className={`flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition duration-150 active:scale-[0.98] ${
                        v.id === current.id ? "border-primary bg-primary/12" : "border-transparent bg-muted"
                      }`}
                    >
                      <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-card font-extrabold">
                        {v.watched ? <CheckIcon className="size-[18px] text-success" strokeWidth={3} aria-label="Visto" /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1 text-left">
                        <small className="block text-xs uppercase text-muted-foreground">Módulo {i + 1}</small>
                        <b className="block">{v.title}</b>
                      </span>
                      {v.watched && <span className={`${pillSt} bg-success/14 text-success`}><i className="size-[7px] rounded-full bg-current" />Visto</span>}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        </div>
      )}

    </div>
  );
}
