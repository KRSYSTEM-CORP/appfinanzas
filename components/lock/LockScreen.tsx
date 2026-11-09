"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DeleteIcon, LockIcon, LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";
import { unlockWithPin, type LockProfile } from "@/lib/actions/pin";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const MAX_LEN = 6;
const MIN_LEN = 4;

function Avatar({ p, size }: { p: LockProfile; size: "md" | "lg" }) {
  const cls = size === "lg" ? "size-20 text-2xl" : "size-16 text-xl";
  return p.photoDataUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.photoDataUrl} alt="" className={`${cls} rounded-full object-cover ring-2 ring-white/60`} />
  ) : (
    <span className={`${cls} grid place-items-center rounded-full bg-primary/15 font-semibold text-primary ring-2 ring-white/60`}>
      {p.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

// Pantalla de bloqueo: se elige el perfil y se escribe el PIN (4 a 6 números).
export function LockScreen({ companyName, profiles }: { companyName: string; profiles: LockProfile[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<LockProfile | null>(profiles.length === 1 ? profiles[0] : null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = useCallback(
    (value: string) => {
      if (!selected || value.length < MIN_LEN) return;
      setError(null);
      startTransition(async () => {
        const r = await unlockWithPin(selected.id, value);
        if (r.success) {
          router.replace("/pos");
          router.refresh();
        } else {
          setError(r.error);
          setPin("");
        }
      });
    },
    [selected, router]
  );

  const press = useCallback(
    (digit: string) => {
      if (isPending) return;
      setError(null);
      setPin((prev) => {
        if (prev.length >= MAX_LEN) return prev;
        const next = prev + digit;
        if (next.length === MAX_LEN) queueMicrotask(() => submit(next));
        return next;
      });
    },
    [isPending, submit]
  );

  // Teclado físico.
  useEffect(() => {
    if (!selected) return;
    function onKey(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Enter") submit(pin);
      else if (e.key === "Escape") {
        setSelected(null);
        setPin("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, pin, press, submit]);

  return (
    <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-gradient-to-br from-primary/25 via-background to-primary/10 p-4">
      <div className="absolute -left-24 -top-24 size-72 rounded-full bg-primary/25 blur-3xl" aria-hidden />
      <div className="absolute -bottom-24 -right-24 size-80 rounded-full bg-primary/20 blur-3xl" aria-hidden />

      <section
        aria-labelledby="lock-title"
        className="relative flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl border border-white/40 bg-background/70 p-6 shadow-2xl backdrop-blur-xl"
      >
        <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
          <LockIcon className="size-5" aria-hidden />
        </span>
        <div className="text-center">
          <h1 id="lock-title" className="text-lg font-semibold">
            {companyName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {selected ? `Hola, ${selected.name.split(" ")[0]}. Escribe tu PIN.` : "Elige tu perfil para continuar"}
          </p>
        </div>

        {!selected ? (
          profiles.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              Ningún perfil tiene PIN todavía. Cierra la sesión y entra con tu correo y clave.
            </p>
          ) : (
            <ul className="flex flex-wrap justify-center gap-4">
              {profiles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(p);
                      setPin("");
                      setError(null);
                    }}
                    className="flex w-24 flex-col items-center gap-1.5 rounded-2xl p-2 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-primary active:scale-95"
                  >
                    <Avatar p={p} size="md" />
                    <span className="w-full truncate text-center text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.role === "GERENTE" ? "Gerente" : "Vendedor"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            <Avatar p={selected} size="lg" />
            <div className="flex h-4 items-center gap-3" role="status" aria-label={`${pin.length} dígitos escritos`}>
              {Array.from({ length: MAX_LEN }).map((_, i) => (
                <span
                  key={i}
                  className={`size-3 rounded-full border border-primary/60 transition-colors ${i < pin.length ? "bg-primary" : ""}`}
                />
              ))}
            </div>
            <p role="alert" className="min-h-5 text-center text-sm text-destructive">
              {error}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  disabled={isPending}
                  onClick={() => press(k)}
                  className="size-16 rounded-full bg-background/80 text-2xl font-medium shadow-sm ring-1 ring-border transition-transform active:scale-90 disabled:opacity-50"
                >
                  {k}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setPin("");
                  setError(null);
                }}
                className="size-16 rounded-full text-sm text-muted-foreground"
              >
                Cambiar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => press("0")}
                className="size-16 rounded-full bg-background/80 text-2xl font-medium shadow-sm ring-1 ring-border transition-transform active:scale-90 disabled:opacity-50"
              >
                0
              </button>
              <button
                type="button"
                aria-label="Borrar"
                disabled={isPending}
                onClick={() => setPin((p) => p.slice(0, -1))}
                className="grid size-16 place-items-center rounded-full text-muted-foreground"
              >
                <DeleteIcon className="size-6" />
              </button>
            </div>
            <Button className="w-full" disabled={isPending || pin.length < MIN_LEN} onClick={() => submit(pin)}>
              {isPending ? "Verificando…" : "Entrar"}
            </Button>
          </>
        )}

        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
            <LogOutIcon className="size-4" aria-hidden /> Cerrar sesión
          </Button>
        </form>
      </section>
    </main>
  );
}
