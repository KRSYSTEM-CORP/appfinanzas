"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addLearningVideo, deleteLearningVideo, type LearningVideoRow } from "@/lib/actions/learning";
import { videoEmbed } from "@/lib/learning";

export function LearningPanel({ videos, isAdmin, max }: { videos: LearningVideoRow[]; isAdmin: boolean; max: number }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addLearningVideo({ title, description, url });
      if (result.success) {
        setTitle("");
        setDescription("");
        setUrl("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function remove(v: LearningVideoRow) {
    if (!window.confirm(`¿Quitar el video «${v.title}»?`)) return;
    startTransition(async () => {
      await deleteLearningVideo(v.id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {videos.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Todavía no hay videos. Pronto agregaremos guías paso a paso.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {videos.map((v) => {
            const embed = videoEmbed(v.url);
            return (
              <Card key={v.id}>
                <CardHeader>
                  <CardTitle className="text-base">{v.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {embed ? (
                    <div className="aspect-video overflow-hidden rounded-md border bg-black">
                      <iframe
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
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2"
                    >
                      Ver el video <ExternalLinkIcon className="size-3.5" />
                    </a>
                  )}
                  {v.description && <p className="text-sm text-muted-foreground">{v.description}</p>}
                  {isAdmin && (
                    <div>
                      <Button size="sm" variant="ghost" disabled={isPending} onClick={() => remove(v)}>
                        Quitar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Agregar video ({videos.length} de {max})</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={add} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lv-title">Título</Label>
                <Input id="lv-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lv-url">Enlace (YouTube o Vimeo, https://…)</Label>
                <Input id="lv-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lv-desc">Descripción (opcional)</Label>
                <Input id="lv-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div>
                <Button type="submit" disabled={isPending || videos.length >= max}>
                  Agregar video
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
