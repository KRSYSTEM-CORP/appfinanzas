"use client";

import { useState, useTransition } from "react";
import { LockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { enterBranch } from "@/lib/actions/branches";
import { SEDE_SWITCH_EVENT } from "@/components/nav/SedeZoom";

// Pide la clave de la cuenta antes de entrar a una sede (o a «Todas»).
export function EnterBranchDialog({
  target,
  onClose,
}: {
  target: { id: string | null; name: string };
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await enterBranch(target.id, password);
      if (!r.success) {
        setError(r.error);
        return;
      }
      onClose();
      // La animación de cambio de sede se encarga de volver a Inicio y refrescar los datos.
      window.dispatchEvent(new CustomEvent(SEDE_SWITCH_EVENT, { detail: { toId: target.id, toName: target.name } }));
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockIcon className="size-4" aria-hidden /> Entrar a {target.name}
            </DialogTitle>
            <DialogDescription>Escribe tu clave de administrador para cambiar de sede.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="branch-password">Clave</Label>
            <Input
              id="branch-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || password.length === 0}>
              Entrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
