"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendAnnouncement } from "@/lib/actions/admin";

export function AnnouncementForm({ recipientCount }: { recipientCount: number }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await sendAnnouncement({ subject, message });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setResult(`Enviado a ${res.sent} de ${res.total} empresas.`);
      setSubject("");
      setMessage("");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Se enviará por correo a las {recipientCount} empresas activas registradas.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="announcement-subject">Asunto</Label>
        <Input id="announcement-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <p className="text-xs text-muted-foreground">Ej. Nueva función disponible en KR POS</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="announcement-message">Mensaje</Label>
        <Textarea
          id="announcement-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder="Escribe el anuncio o novedad que quieres compartir..."
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && <p className="text-sm text-success">{result}</p>}

      <Button
        onClick={handleSubmit}
        disabled={isPending || !subject.trim() || !message.trim()}
        className="self-start"
      >
        {isPending ? "Enviando..." : "Enviar anuncio"}
      </Button>
    </div>
  );
}
