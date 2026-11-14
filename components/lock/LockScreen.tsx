"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/actions/auth";
import { createFirstManagerPin, unlockWithPin, type LockProfile } from "@/lib/actions/pin";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const MAX_LEN = 4;
const MIN_LEN = 4;

// Avatares de la preview (silueta con fondo de color) cuando la persona no tiene foto.
const AVC = [["#ffd9c2", "#7a3ff2"], ["#cfe3ff", "#0f9d9a"], ["#ffd1e3", "#433ddd"], ["#d7f3dc", "#c2410c"], ["#ffe3c2", "#d6407f"], ["#e3dcff", "#14532d"]];
const SKIN = ["#f1c9a5", "#d9a273", "#8d5a3b", "#f6d7bd"];
const HAIR = ["#2b1d17", "#6b3f1d", "#111", "#8a3b12"];
function avatarSrc(i: number): string {
  const k = ((i % 6) + 6) % 6;
  const c = AVC[k];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${c[0]}"/><circle cx="48" cy="40" r="18" fill="${SKIN[k % 4]}"/><path d="M28 38c0-14 9-22 20-22s20 8 20 22c-4-7-10-10-20-10s-16 3-20 10Z" fill="${HAIR[(k + 1) % 4]}"/><path d="M14 96c2-20 16-30 34-30s32 10 34 30Z" fill="${c[1]}"/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function Photo({ p, index }: { p: LockProfile; index: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="photo" src={p.photoDataUrl ?? avatarSrc(index)} alt="" />;
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const t0 = setTimeout(() => setNow(new Date()), 0);
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);
  return now;
}

const LETTERS: Record<string, string> = { "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL", "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ" };

// Pantalla de bloqueo: se elige el perfil y se escribe el PIN (4 números).
export function LockScreen({ companyName, profiles }: { companyName: string; profiles: LockProfile[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<LockProfile | null>(profiles.length === 1 ? profiles[0] : null);
  const [pin, setPin] = useState("");
  // Crear el primer PIN de gerente: se escribe y se confirma.
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const now = useClock();

  const submit = useCallback(
    (value: string) => {
      if (!selected || value.length < MIN_LEN) return;
      setError(null);
      if (selected.access === "create" && firstPin === null) {
        // Primer paso: guardar el PIN escrito y pedir que lo repita.
        setFirstPin(value);
        setPin("");
        return;
      }
      startTransition(async () => {
        const r =
          selected.access === "create"
            ? await createFirstManagerPin(selected.id, firstPin ?? "", value)
            : await unlockWithPin(selected.id, value);
        if (r.success) {
          router.replace(r.redirectTo ?? "/pos");
          router.refresh();
        } else {
          setError(r.error);
          setPin("");
          if (selected.access === "create") setFirstPin(null);
        }
      });
    },
    [selected, firstPin, router]
  );

  const press = useCallback(
    (digit: string) => {
      if (isPending) return;
      setError(null);
      setPin((prev) => {
        if (prev.length >= MAX_LEN) return prev;
        const next = prev + digit;
        if (next.length === MAX_LEN && selected?.access === "pin") queueMicrotask(() => submit(next));
        return next;
      });
    },
    [isPending, submit, selected]
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
        setFirstPin(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, pin, press, submit]);

  const roleLabel = (p: LockProfile) => (p.role === "GERENTE" ? "Gerente" : "Vendedor");
  const selIndex = selected ? profiles.findIndex((p) => p.id === selected.id) : 0;
  const clock = now ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` : "00:00";
  const date = now ? now.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" }) : "";
  const goBack = () => {
    setSelected(null);
    setPin("");
    setFirstPin(null);
    setError(null);
  };

  return (
    <main className="kr-ios">
      <i className="iw w1" aria-hidden />
      <i className="iw w2" aria-hidden />
      <i className="iw w3" aria-hidden />
      <section className="iosc" aria-labelledby="lock-title" key={selected ? "pin" : "users"}>
        {!selected ? (
          <>
            <svg className="ilock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="5" y="11" width="14" height="10" rx="3" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <div className="ioscl" aria-label={`Hora ${clock}`}>{clock}</div>
            <div className="iosd">{date}</div>
            <h1 id="lock-title" className="ihint">Pantalla bloqueada · toca tu usuario</h1>
            {profiles.length === 0 ? (
              <p className="ihint">No hay perfiles activos en {companyName}. Cierra la sesión y entra con otra cuenta.</p>
            ) : (
              <div className="iusers">
                {profiles.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    className="iu glass"
                    onClick={() => {
                      setSelected(p);
                      setPin("");
                      setFirstPin(null);
                      setError(null);
                    }}
                  >
                    <span className="ia"><Photo p={p} index={i} /></span>
                    <span>
                      <b>{p.name}</b>
                      <small>
                        {roleLabel(p)}
                        {p.access !== "pin" && " · sin PIN"}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <span className="ipav"><Photo p={selected} index={selIndex} /></span>
            <h1 id="lock-title" style={{ margin: "6px 0 0", fontSize: 24, letterSpacing: "-.03em" }}>{selected.name}</h1>
            {selected.access === "ask-manager" ? (
              <>
                <p className="ihint" style={{ margin: 0 }}>
                  {selected.managerPinReady
                    ? "Todavía no tienes tu código personal (PIN). Pídele a tu gerente que te lo asigne en Ajustes."
                    : "Todavía no hay un gerente con PIN. Primero el gerente debe crear el suyo; después podrá asignarte el tuyo."}
                </p>
                <div className="ilinks"><button type="button" onClick={goBack}>Cambiar de usuario</button></div>
              </>
            ) : (
              <>
                <p className="ihint" style={{ margin: 0 }}>
                  {selected.access === "create"
                    ? firstPin === null
                      ? `${roleLabel(selected)} · crea tu PIN (4 números)`
                      : "Escribe tu PIN otra vez para confirmarlo"
                    : `${roleLabel(selected)} · escribe tu PIN`}
                </p>
                <div className={`idots${error ? " shake" : ""}`} role="status" aria-label={`${pin.length} dígitos escritos`}>
                  {Array.from({ length: MAX_LEN }).map((_, i) => (
                    <i key={i} className={i < pin.length ? "on" : ""} />
                  ))}
                </div>
                <p className="ihint" role="alert" style={{ minHeight: 20, margin: 0 }}>{error ?? " "}</p>
                <div className="ipad">
                  {KEYS.map((k) => (
                    <button key={k} type="button" className="gkey glass" disabled={isPending} aria-label={k} onClick={() => press(k)}>
                      {k}
                      <small>{LETTERS[k] ?? ""}</small>
                    </button>
                  ))}
                  <span className="gkey sp" aria-hidden />
                  <button type="button" className="gkey glass" disabled={isPending} aria-label="0" onClick={() => press("0")}>
                    0<small></small>
                  </button>
                  <button type="button" className="gkey ghost" disabled={isPending} aria-label="Borrar" onClick={() => setPin((p) => p.slice(0, -1))}>
                    Borrar
                  </button>
                </div>
                {selected.access === "create" && (
                  <div className="ilinks">
                    <button type="button" disabled={isPending || pin.length < MIN_LEN} onClick={() => submit(pin)}>
                      {firstPin === null ? "Continuar" : "Guardar mi PIN y entrar"}
                    </button>
                  </div>
                )}
                <div className="ilinks"><button type="button" onClick={goBack}>Cambiar de usuario</button></div>
              </>
            )}
          </>
        )}
        {!selected && (
          <form action={logout} className="ilinks">
            <button type="submit">Cerrar sesión</button>
          </form>
        )}
      </section>
    </main>
  );
}
