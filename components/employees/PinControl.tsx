"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRoundIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setUserPin } from "@/lib/actions/pin";

// El gerente pone, cambia o quita el PIN de una persona (4 a 6 números, distinto al
// de los demás). Con PIN, esa persona puede bloquear la pantalla y desbloquearla.
export function PinControl({ userId, name, hasPin }: { userId: string; name: string; hasPin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(next: string | null) {
    setError(null);
    startTransition(async () => {
      const r = await setUserPin(userId, next);
      if (!r.success) {
        setError(r.error);
        return;
      }
      toast.success(next ? `PIN de ${name} guardado.` : `PIN de ${name} quitado.`);
      setOpen(false);
      setPin("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <KeyRoundIcon data-icon="inline-start" />
          {hasPin ? "Cambiar PIN" : "Crear PIN"}
        </Button>
        <span className="text-xs text-muted-foreground">{hasPin ? "Tiene PIN" : "Sin PIN"}</span>
        {hasPin && (
          <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => save(null)}>
            Quitar PIN
          </Button>
        )}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        save(pin);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`PIN de ${name}`}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={6}
          pattern="\d{4,6}"
          placeholder="4 a 6 números"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="w-36"
        />
        <Button type="submit" size="sm" disabled={isPending || pin.length < 4}>
          Guardar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setPin("");
            setError(null);
          }}
        >
          Cancelar
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
