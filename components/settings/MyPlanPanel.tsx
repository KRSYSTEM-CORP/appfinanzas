"use client";

import "./my-plan.css";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  CrownIcon,
  LockIcon,
  MailIcon,
  SendIcon,
  SmartphoneIcon,
  SparklesIcon,
  StarIcon,
  UploadIcon,
  WalletIcon,
} from "lucide-react";
import { WhatsappIcon } from "@/components/ui/whatsapp-icon";
import { AI_PACKS } from "@/lib/assistant";
import { PLANS, planAmountDueUsdCents, recommendPlan, type PlanDef } from "@/lib/plans";
import { TRIAL_DAYS } from "@/lib/billing";
import { WHATSAPP_PHONE } from "@/lib/legal";
import { formatDate } from "@/lib/format";
import { reportPlanPayment, type PlanUsage } from "@/lib/actions/plan";
import { requestCreditPack } from "@/lib/actions/assistant";

type View = "home" | "plans" | "pay" | "status" | "hist";
type Method = "CARD" | "BINANCE";
type Sel = { kind: "plan"; plan: PlanDef } | { kind: "pack"; credits: number; priceCents: number };

const METHOD_NAME: Record<Method, string> = { CARD: "Pago Móvil", BINANCE: "Binance (USDT)" };
const LOCK_SECONDS = 30 * 60;

// Etiquetas de los paquetes de créditos (copiadas de la preview).
const PACK_TAG: Record<number, string | null> = { 50: null, 100: "Ahorra 10 %", 250: "Ahorra 20 %", 500: "Ahorra 30 %", 1000: "Mejor valor · −40 %" };

const nf = (n: number, d = 2) => n.toLocaleString("es-VE", { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (cents: number, d = 0) => `$${nf(cents / 100, d)}`;
const bs = (n: number) => `Bs ${nf(n)}`;

// Logo del banco de Pago Móvil a partir del nombre que configuró el administrador.
const BANK_LOGOS: [string, string][] = [
  ["banesco", "banesco"], ["mercantil", "mercantil"], ["provincial", "provincial"], ["venezuela", "bdv"], ["bdv", "bdv"],
  ["bancaribe", "bancaribe"], ["bancamiga", "bancamiga"], ["exterior", "exterior"], ["tesoro", "tesoro"],
  ["bicentenario", "bicentenario"], ["venezolano de cr", "vzlacredito"], ["bnc", "bnc"], ["banplus", "banplus"],
  ["sofitasa", "sofitasa"], ["bod", "bod"], ["plaza", "plaza"], ["activo", "activo"], ["bancrecer", "bancrecer"],
  ["bfc", "bfc"], ["caroni", "caroni"], ["del sur", "delsur"], ["100%", "cienbanco"], ["r4", "r4"],
];
function bankLogo(name: string | null): string | null {
  const n = (name ?? "").toLowerCase();
  const hit = BANK_LOGOS.find(([k]) => n.includes(k));
  return hit ? `/banks/${hit[1]}.png` : null;
}

function Logo({ src, alt, icon }: { src: string | null; alt: string; icon: React.ReactNode }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <span className="kp-lg" title={alt}><img src={src} alt={alt} loading="lazy" /></span>;
  return <span className="kp-lg ico" title={alt}>{icon}</span>;
}

function UsageRow({ label, used, max }: { label: string; used: number; max: number | null }) {
  const p = max == null ? 5 : (used / max) * 100;
  return (
    <div className="kp-hb">
      <span className="nm">{label}</span>
      <div className={`kp-meter ${p > 85 ? "bad" : p > 65 ? "warn" : "ok"}`}><span style={{ width: `${Math.min(100, p)}%` }} /></div>
      <span className="vl">{used} / {max == null ? "∞" : nf(max, 0)}</span>
    </div>
  );
}

function Btn({ children, onClick, primary, disabled, type = "button" }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button type={type} className={`kp-btn${primary ? " primary" : ""}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Packs({ onBuy }: { onBuy: (credits: number, priceCents: number) => void }) {
  return (
    <section className="kp-card" id="packs">
      <header>
        <div>
          <h3>Recarga de créditos</h3>
          <p>Cada uso del Asistente IA cuesta 5 créditos. Consultar siempre es gratis y los créditos comprados no vencen.</p>
        </div>
      </header>
      <div className="kp-packs2">
        {AI_PACKS.map((k, i) => (
          <article key={k.credits} className={`kp-pk2 g${i % 5}`}>
            {k.credits === 250 && <span className="kp-rb3">Más popular</span>}
            <b className="kc kp-mono">{nf(k.credits, 0)}</b>
            <span className="kl">créditos</span>
            <div className="kpz kp-mono">{usd(k.priceCents)}</div>
            <small>{nf((k.priceCents / k.credits), 1)} ¢ por crédito · {nf(k.credits / 5, 0)} usos</small>
            {PACK_TAG[k.credits] ? <span className="sv">{PACK_TAG[k.credits]}</span> : <span className="sv no">Para empezar</span>}
            <button type="button" className="kp-btn" onClick={() => onBuy(k.credits, k.priceCents)}>Comprar</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Support() {
  return (
    <section className="kp-card">
      <header>
        <div>
          <h3>Soporte</h3>
          <p>Escríbenos y te respondemos</p>
        </div>
      </header>
      <div className="kp-sup">
        <a className="kp-supb wa" href={`https://wa.me/${WHATSAPP_PHONE}`} target="_blank" rel="noopener noreferrer">
          <i className="kp-supi"><WhatsappIcon className="size-6" /></i>
          <span><b>WhatsApp</b><small>+1 (904) 579-6156</small></span>
        </a>
        <a className="kp-supb ml" href="mailto:contacto@krsystem-corp.com">
          <i className="kp-supi"><MailIcon className="size-6" aria-hidden /></i>
          <span><b>Correo</b><small>contacto@krsystem-corp.com</small></span>
        </a>
      </div>
    </section>
  );
}

// «Mi plan» dentro de Ajustes, igual a la preview: plan actual, capacidad, recomendación,
// recarga de créditos, elección de plan y pago en 3 pasos (Método · Datos de pago · Comprobante).
export function MyPlanPanel({ usage }: { usage: PlanUsage }) {
  const router = useRouter();
  const [view, setView] = useState<View>("home");
  const [sel, setSel] = useState<Sel | null>(null);
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState<Method>("CARD");
  const [okTerms, setOkTerms] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", ref: "" });
  const [proof, setProof] = useState<{ dataUrl: string; name: string } | null>(null);
  const [sent, setSent] = useState<{ ref: string; title: string; cents: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  // Tasa bloqueada 30 min en el paso 2 (cuenta regresiva en el cliente).
  const [lock, setLock] = useState<{ rate: number | null; left: number }>({ rate: usage.platformRate, left: LOCK_SECONDS });

  const { plan: current } = usage;
  const active = usage.hasApprovedPayment || usage.isExempt;
  const rec = recommendPlan(usage.usedUsers, usage.usedProducts);
  const pending = usage.history.find((h) => h.status === "PENDING") ?? null;

  function go(v: View, top = true) {
    setView(v);
    if (top) window.scrollTo({ top: 0 });
  }

  const dueCents = !sel
    ? 0
    : sel.kind === "pack"
      ? sel.priceCents
      : planAmountDueUsdCents({ selected: sel.plan.id, current: current.id, monthlyFeeUsdCents: usage.monthlyFeeUsdCents, hasApprovedPayment: usage.hasApprovedPayment });
  const rate = step === 2 ? lock.rate : usage.platformRate;
  const bsDue = rate != null ? (dueCents / 100) * rate : null;
  const isBs = method === "CARD";
  const mainAmount = isBs ? (bsDue != null ? bs(bsDue) : "Tasa no disponible") : usd(dueCents, 2);
  const refAmount = !isBs && bsDue != null ? `≈ ${bs(bsDue)}` : null;

  useEffect(() => {
    if (view !== "pay" || step !== 2) return;
    const id = setInterval(() => setLock((l) => (l.left > 0 ? { ...l, left: l.left - 1 } : l)), 1000);
    return () => clearInterval(id);
  }, [view, step]);

  function pick(s: Sel) {
    setSel(s);
    setStep(1);
    setOkTerms(false);
    setProof(null);
    go("pay");
  }

  function next() {
    if (step === 1 && !okTerms) {
      toast("Confirma las condiciones del plan para continuar");
      return;
    }
    if (step === 1 && method === "CARD" && usage.platformRate == null) {
      toast("La tasa BCV del día no está disponible. Elige Binance o inténtalo más tarde.");
      return;
    }
    if (step === 1) setLock({ rate: usage.platformRate, left: LOCK_SECONDS });
    setStep((s) => s + 1);
    window.scrollTo({ top: 0 });
  }

  function handleProofFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("El comprobante debe ser una imagen (JPG, PNG o WebP).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        setProof({ dataUrl: canvas.toDataURL("image/jpeg", 0.82), name: file.name });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function send() {
    if (!sel) return;
    const ref = form.ref.trim();
    if (!form.name.trim()) return void toast("Escribe tu nombre");
    if (form.phone.replace(/\D/g, "").length < 10) return void toast("Escribe tu teléfono (obligatorio)");
    if (ref.length < 4) return void toast("Escribe la referencia del pago");
    if (form.email.trim() && !/@/.test(form.email)) return void toast("El correo no parece válido (es opcional)");
    if (!proof) return void toast("Añade el comprobante del pago");
    startTransition(async () => {
      const title = sel.kind === "plan" ? sel.plan.label : `Recarga de ${sel.credits} créditos`;
      const r =
        sel.kind === "plan"
          ? await reportPlanPayment({
              plan: sel.plan.id,
              method,
              reference: ref,
              name: form.name,
              phone: form.phone,
              email: form.email,
              proofImageDataUrl: proof.dataUrl,
            })
          : await requestCreditPack(sel.credits, `${METHOD_NAME[method]} ref. ${ref} · ${form.name.trim()} · ${form.phone.trim()}`);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      setSent({ ref, title, cents: dueCents });
      setForm({ name: "", phone: "", email: "", ref: "" });
      setProof(null);
      go("status");
      toast("Comprobante enviado por WhatsApp y correo al administrador");
      router.refresh();
    });
  }

  function copy(v: string) {
    void navigator.clipboard?.writeText(v).then(
      () => toast(`Copiado: ${v}`),
      () => toast("No se pudo copiar")
    );
  }

  // ---------------------------------------------------------------- home
  function Home() {
    const left = usage.daysLeft;
    const dueDate = usage.nextPaymentDueDate ? formatDate(usage.nextPaymentDueDate) : null;
    const used = Math.min(TRIAL_DAYS, Math.max(0, TRIAL_DAYS - (left ?? TRIAL_DAYS)));
    return (
      <>
        {pending && (
          <section className="kp-card kp-promo">
            <span className="kp-sico"><ClockIcon aria-hidden /></span>
            <div style={{ flex: 1 }}>
              <b>Tienes un pago en revisión</b>
              <div className="kp-muted">{pending.title} · ref. {pending.reference || "—"} · {usd(pending.totalUsdCents, 2)}</div>
            </div>
            <Btn onClick={() => { setSent({ ref: pending.reference, title: pending.title, cents: pending.totalUsdCents }); go("status"); }}>Ver estado</Btn>
          </section>
        )}
        <section className={`kp-card kp-hero${active ? " on" : ""}`}>
          <div className="kp-row"><span className="kp-pill"><CrownIcon aria-hidden /> {active ? "Plan activo" : "Período de prueba"}</span></div>
          <h2 className="kp-ph2">{current.label}</h2>
          <p style={{ margin: 0, opacity: 0.85 }}>
            {usage.isExempt
              ? "Tu empresa está exonerada de mensualidades."
              : active
                ? `Renovación mensual. Próximo cobro el ${dueDate ?? "—"}.`
                : `${TRIAL_DAYS} días gratis. Te avisamos 5 días antes de que venza para que renueves con un toque.`}
          </p>
          <div className="kp-trial">
            <div>
              <b className="kp-mono">{active ? "Activo" : left != null ? `${left} días` : "Prueba"}</b>
              <small>{active ? (dueDate && !usage.isExempt ? `hasta el ${dueDate}` : "sin mensualidades") : dueDate ? `hasta el ${dueDate}` : "sin fecha de cobro aún"}</small>
            </div>
            <div className="kp-meter" style={{ flex: 1, background: "rgba(255,255,255,.25)" }}>
              <span style={{ width: `${active ? 100 : ((used + 1) / TRIAL_DAYS) * 100}%`, background: "#fff" }} />
            </div>
          </div>
          <div className="kp-row">
            {!usage.isExempt && <Btn primary onClick={() => go("plans")}><CrownIcon aria-hidden /> {active ? "Cambiar de plan" : "Activar mi plan"}</Btn>}
            <Btn onClick={() => go("hist", false)}>Ver pagos</Btn>
          </div>
        </section>

        <div className="kp-grid kp-g2">
          <section className="kp-card">
            <header>
              <div>
                <h3>Capacidad de tu plan</h3>
                <p>Se cuenta desde que elegiste tu plan</p>
              </div>
            </header>
            <UsageRow label="Usuarios" used={usage.usedUsers} max={current.maxUsers} />
            <UsageRow label="Productos" used={usage.usedProducts} max={current.maxProducts} />
            {current.aiCredits > 0 ? (
              <UsageRow label="Créditos IA" used={Math.min(current.aiCredits, Math.max(0, current.aiCredits - usage.creditsLeft))} max={current.aiCredits} />
            ) : (
              <div className="kp-li"><span>Asistente IA</span><b>Consulta gratis · recarga créditos para aplicar</b></div>
            )}
            <p className="kp-note">
              Con {current.maxUsers} {current.maxUsers === 1 ? "usuario" : "usuarios"} y {current.maxProducts == null ? "productos ilimitados" : `${nf(current.maxProducts, 0)} productos máximo`}. Si llegas al límite, te avisamos para cambiar de plan.
            </p>
          </section>
          <section className="kp-card">
            <header>
              <div>
                <h3>Te recomendamos</h3>
                <p>Según lo que usas hoy: {usage.usedUsers} usuarios y {usage.usedProducts} productos</p>
              </div>
            </header>
            <div className="kp-rec">
              <span className="kp-sico"><SparklesIcon aria-hidden /></span>
              <div>
                <b style={{ fontSize: 18 }}>{rec.label}</b>
                <div className="kp-muted">{rec.tagline} · {usd(rec.priceUsdCents, 2)} al mes</div>
              </div>
            </div>
            {!usage.isExempt && <Btn primary onClick={() => go("plans")}>Ver planes</Btn>}
            <p className="kp-note">Cuando tu equipo o tu inventario crezcan, te avisamos antes de llegar al límite.</p>
          </section>
        </div>
        <Packs onBuy={(credits, priceCents) => pick({ kind: "pack", credits, priceCents })} />
        <Support />
      </>
    );
  }

  // --------------------------------------------------------------- plans
  function Plans() {
    const firstMonth = !usage.hasApprovedPayment;
    return (
      <>
        <div className="kp-row"><Btn onClick={() => go("home")}><ArrowLeftIcon aria-hidden /> Volver</Btn></div>
        {firstMonth && (
          <div className="kp-card kp-promo">
            <span className="kp-sico"><StarIcon aria-hidden /></span>
            <div style={{ flex: 1 }}>
              <b>Tu bienvenida tiene beneficios</b>
              <div className="kp-muted">15 días gratis · el primer mes de Emprende cuesta $9,99 · desde el 2.º mes pagas $12,99 al mes.</div>
            </div>
          </div>
        )}
        <div className="kp-grid kp-plans">
          {Object.values(PLANS).map((p) => {
            const isRec = p.id === rec.id;
            const now = p.id === current.id;
            return (
              <article key={p.id} className={`kp-card kp-plan2${isRec ? " rec" : ""}`}>
                {isRec && <span className="kp-ribbon">Recomendado para ti</span>}
                <h3>{p.label}</h3>
                <p className="kp-muted" style={{ margin: 0 }}>{p.tagline}</p>
                <div className="kp-pr">
                  <b className="kp-mono">
                    {p.firstMonthUsdCents != null && firstMonth ? (
                      <>
                        <s>{usd(p.priceUsdCents, 2)}</s> {usd(p.firstMonthUsdCents, 2)}
                        <span className="kp-pill ok">Solo el primer mes</span>
                        <small>Luego pagas {usd(p.priceUsdCents, 2)} al mes</small>
                      </>
                    ) : (
                      usd(p.priceUsdCents, 2)
                    )}
                  </b>
                  <span>/ mes</span>
                </div>
                <div className="kp-muted" style={{ fontSize: 13 }}>
                  {p.maxUsers} {p.maxUsers === 1 ? "usuario" : "usuarios"} · {p.maxProducts == null ? "productos ilimitados" : `${nf(p.maxProducts, 0)} productos`}
                  {p.aiCredits ? ` · ${p.aiCredits} créditos IA` : ""}
                </div>
                <ul>
                  {p.features.map((f) => (
                    <li key={f}><CheckIcon aria-hidden strokeWidth={3} />{f}</li>
                  ))}
                </ul>
                {now && <span className="kp-st ok" style={{ alignSelf: "flex-start", marginBottom: 8 }}>{active ? "Tu plan actual" : "Tu plan de prueba"}</span>}
                <Btn primary={isRec} onClick={() => pick({ kind: "plan", plan: p })}>Elegir {p.label}</Btn>
              </article>
            );
          })}
        </div>
        <p className="kp-note">Los límites de usuarios y productos se cuentan desde el momento en que eliges tu plan.</p>
        <Packs onBuy={(credits, priceCents) => pick({ kind: "pack", credits, priceCents })} />
        <Support />
      </>
    );
  }

  // ----------------------------------------------------------------- pay
  function Pay() {
    if (!sel) return null;
    const isPack = sel.kind === "pack";
    const steps = ["Método", "Datos de pago", "Comprobante"];
    const name = isPack ? `Recarga de ${sel.credits} créditos` : sel.plan.label;
    const listCents = isPack ? sel.priceCents : sel.plan.priceUsdCents;
    const promo = !isPack && dueCents < listCents && dueCents === sel.plan.firstMonthUsdCents;
    const pmLogo = <Logo src={bankLogo(usage.pagoMovil.bank)} alt={usage.pagoMovil.bank ?? "Pago Móvil"} icon={<SmartphoneIcon aria-hidden />} />;
    const bnLogo = <Logo src="/banks/binance.png" alt="Binance" icon={<WalletIcon aria-hidden />} />;
    const rows: [string, string][] =
      method === "CARD"
        ? ([["Banco", usage.pagoMovil.bank], ["Teléfono", usage.pagoMovil.phone], ["Cédula / RIF", usage.pagoMovil.id]] as [string, string | null][]).filter((r): r is [string, string] => !!r[1])
        : ([["Binance ID", usage.binance.id]] as [string, string | null][]).filter((r): r is [string, string] => !!r[1]);

    const summary = (
      <section className="kp-card">
        <p className="kp-eyebrow">Tu negocio, conectado con KR POS</p>
        <h3 style={{ fontSize: 20 }}>{name} · {isPack ? "pago único" : "suscripción mensual"}</h3>
        <div className="kp-li"><span>{isPack ? "Recarga" : "Mensualidad"}</span><b className="kp-mono">{usd(listCents, 2)}</b></div>
        <div className="kp-li"><span className="kp-muted">Tasa dólar BCV del día</span><b className="kp-mono">{usage.platformRate != null ? bs(usage.platformRate) : "No disponible"}</b></div>
        {promo && (
          <>
            <div className="kp-li"><span className="kp-pos">Nuevos usuarios · solo el 1.er mes</span><b className="kp-pos kp-mono">−{usd(listCents - dueCents, 2)}</b></div>
            <div className="kp-li"><span className="kp-muted">Desde el 2.º mes</span><b className="kp-mono">{usd(listCents, 2)} / mes</b></div>
          </>
        )}
        <div className="kp-li">
          <b>Total a pagar</b>
          <div className="kp-amt" style={{ fontSize: 20 }}>{mainAmount}{refAmount && <small>{refAmount}</small>}</div>
        </div>
        <p className="kp-note">Este pago cubre el importe y período indicados; no autoriza débitos automáticos de renovación.</p>
      </section>
    );

    let body: React.ReactNode;
    if (step === 1) {
      const options: Method[] = ["CARD", "BINANCE"];
      body = (
        <section className="kp-card">
          <h3>¿Cómo prefieres pagar?</h3>
          <p className="kp-muted" style={{ margin: "0 0 10px" }}>Elige la opción que te resulte más cómoda.</p>
          <p className="kp-note" style={{ margin: "0 0 12px" }}>
            El pago de la suscripción se calcula a la <b>tasa dólar BCV del día</b>: {usage.platformRate != null ? `hoy Bs ${nf(usage.platformRate)} por $1.` : "la tasa de hoy aún no está disponible."}
          </p>
          <div className="kp-opts">
            {options.map((k) => {
              const bsLine = k === "CARD";
              const amt = bsLine ? (usage.platformRate != null ? bs((dueCents / 100) * usage.platformRate) : "Sin tasa") : usd(dueCents, 2);
              return (
                <button key={k} type="button" className="kp-opt" aria-pressed={method === k} onClick={() => setMethod(k)}>
                  {k === "CARD" ? pmLogo : bnLogo}
                  <span style={{ flex: 1, textAlign: "left" }}>
                    <b>{METHOD_NAME[k]}</b>
                    <small className="kp-muted" style={{ display: "block" }}>{bsLine ? "Pagas en bolívares" : "Pagas en divisa"}</small>
                  </span>
                  <b className="kp-mono">{amt}</b>
                </button>
              );
            })}
          </div>
          <label className="kp-li" style={{ cursor: "pointer", marginTop: 12 }}>
            <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input className="kp-ck2" type="checkbox" checked={okTerms} onChange={(e) => setOkTerms(e.target.checked)} /> Confirmo las condiciones del plan seleccionado.
            </span>
          </label>
          <div className="kp-row" style={{ marginTop: 12 }}><Btn primary onClick={next}>Continuar</Btn></div>
        </section>
      );
    } else if (step === 2) {
      const mm = String(Math.floor(lock.left / 60)).padStart(2, "0");
      const ss = String(lock.left % 60).padStart(2, "0");
      const expired = lock.left <= 0;
      body = (
        <section className="kp-card">
          <div className="kp-pmh">{method === "CARD" ? pmLogo : bnLogo}<h3>Datos para pagar · {METHOD_NAME[method]}</h3></div>
          <div className="kp-rlk">
            <span className={`kp-st ${expired ? "bad" : "warn"}`}>
              <ClockIcon aria-hidden />{expired ? "Tasa vencida" : "Tasa bloqueada"} <b className="kp-mono">{expired ? "00:00" : `${mm}:${ss}`}</b>
            </span>
            <span className="kp-muted" style={{ fontSize: 13 }}>
              {lock.rate != null ? `Tasa dólar BCV del día: $1 = Bs ${nf(lock.rate)} · envía exactamente el monto indicado` : "Envía exactamente el monto indicado"}
            </span>
          </div>
          {expired && (
            <div className="kp-row" style={{ marginBottom: 8 }}>
              <Btn onClick={() => { router.refresh(); setLock({ rate: usage.platformRate, left: LOCK_SECONDS }); }}>Actualizar tasa</Btn>
            </div>
          )}
          <div className="kp-big2 kp-mono">{mainAmount}</div>
          {refAmount && <small className="kp-muted">{refAmount}</small>}
          {method === "BINANCE" && usage.binance.qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={usage.binance.qrDataUrl} alt="QR de Binance Pay" style={{ width: 160, height: 160, borderRadius: 16, margin: "10px 0", objectFit: "cover" }} />
          )}
          {rows.length === 0 && <p className="kp-note">El administrador de KR System todavía no configuró los datos de {METHOD_NAME[method]}. Escríbenos por soporte.</p>}
          {rows.map(([l, v]) => (
            <div key={l} className="kp-li">
              <div><small>{l}</small><b>{v}</b></div>
              <Btn onClick={() => copy(v)}><CopyIcon aria-hidden /> Copiar</Btn>
            </div>
          ))}
          {usage.paymentInstructions && <p className="kp-note" style={{ whiteSpace: "pre-line" }}>{usage.paymentInstructions}</p>}
          <p className="kp-note">
            <LockIcon aria-hidden /> Estos datos los define únicamente el administrador de KR System desde su panel; no se pueden editar aquí. Paga desde tu banco o billetera y vuelve para reportar el pago.
          </p>
          <div className="kp-row" style={{ marginTop: 12 }}>
            <Btn primary onClick={next}><CheckIcon aria-hidden /> Ya hice el pago</Btn>
            <Btn onClick={() => setStep(1)}>Atrás</Btn>
          </div>
          <p className="kp-note">¿Aún no pagaste? Puedes volver cuando estés listo.</p>
        </section>
      );
    } else {
      body = (
        <section className="kp-card">
          <p className="kp-eyebrow">Paso 3 de 3</p>
          <h3>Ya casi está.</h3>
          <p className="kp-muted" style={{ margin: "0 0 6px" }}>Adjunta tu comprobante y escribe la referencia del pago.</p>
          <label className="kp-field">Nombre *<input type="text" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="kp-field">Teléfono *<input type="tel" inputMode="tel" autoComplete="tel" placeholder="0412-000-0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="kp-field">Correo (opcional)<input type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="kp-field">Número de referencia *<input type="text" inputMode="numeric" maxLength={12} placeholder="Escribe la referencia de tu pago" value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} /></label>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => handleProofFile(e.target.files?.[0])} />
          <button type="button" className="kp-drop" style={{ marginTop: 12 }} onClick={() => fileRef.current?.click()}>
            <span className="kp-sico"><UploadIcon aria-hidden /></span>
            <div>
              <b>{proof ? `${proof.name} adjuntado` : "Añadir comprobante *"}</b>
              <div className="kp-muted" style={{ fontSize: 13 }}>Elige una foto de tu galería o un archivo · JPG, PNG o WebP · hasta 10 MB</div>
            </div>
          </button>
          <p className="kp-note"><WhatsappIcon aria-hidden /> Tu comprobante se envía por WhatsApp y al correo del administrador de KR System. Verificaremos los datos antes de activar tu plan; conserva el comprobante hasta recibir la confirmación.</p>
          <div className="kp-row" style={{ marginTop: 12 }}>
            <Btn primary onClick={send} disabled={isPending}><SendIcon aria-hidden /> {isPending ? "Enviando…" : "Enviar comprobante"}</Btn>
            <Btn onClick={() => setStep(2)}>Atrás</Btn>
          </div>
          <p className="kp-note">La confirmación del pago queda sujeta a revisión.</p>
        </section>
      );
    }

    return (
      <>
        <div className="kp-row"><Btn onClick={() => (step > 1 ? setStep(step - 1) : go(isPack ? "home" : "plans"))}><ArrowLeftIcon aria-hidden /> Volver</Btn></div>
        <div className="kp-steps3" aria-label={`Paso ${step} de 3`}>
          {steps.map((s, i) => (
            <span key={s} className={`kp-s3${step > i + 1 ? " done" : step === i + 1 ? " on" : ""}`}>
              <i>{step > i + 1 ? <CheckIcon aria-hidden strokeWidth={3} /> : i + 1}</i>{s}
            </span>
          ))}
        </div>
        <div className="kp-grid kp-g2">{body}{summary}</div>
      </>
    );
  }

  // -------------------------------------------------------------- status
  function Status() {
    const ST: [string, string][] = [
      ["Reportado", "Recibimos tu comprobante"],
      ["En revisión", "Verificamos la referencia (hasta 2 h hábiles)"],
      ["Plan activo", "Todo listo para seguir creciendo"],
    ];
    const s = 1;
    const msg = encodeURIComponent(`Hola, les envío el comprobante de pago de la suscripción de ${usage.companyName}.`);
    return (
      <section className="kp-card" style={{ textAlign: "center" }}>
        <span className="kp-ck kp-bigck"><ClockIcon aria-hidden strokeWidth={3} /></span>
        <h2 style={{ margin: "10px 0 2px", fontSize: 24, fontWeight: 800 }}>Pago reportado</h2>
        <p className="kp-muted" style={{ margin: "0 auto 14px", maxWidth: "44ch" }}>
          Referencia {sent?.ref || "—"} · {sent ? usd(sent.cents, 2) : ""}. Tu comprobante fue enviado por WhatsApp y al correo del administrador de KR System. Te avisamos cuando esté aprobado.
        </p>
        <div className="kp-tl">
          {ST.map((x, i) => (
            <div key={x[0]} className={`kp-tli${i <= s ? " on" : ""}`}>
              <i>{i < s ? <CheckIcon aria-hidden strokeWidth={3} /> : i + 1}</i>
              <div><b>{x[0]}</b><small>{x[1]}</small></div>
            </div>
          ))}
        </div>
        <div className="kp-row" style={{ justifyContent: "center", marginTop: 14 }}>
          <Btn primary onClick={() => go("home")}>Ir a Mi Plan</Btn>
          <a className="kp-btn" href={`https://wa.me/${WHATSAPP_PHONE}?text=${msg}`} target="_blank" rel="noopener noreferrer"><WhatsappIcon /> Escribir por WhatsApp</a>
        </div>
      </section>
    );
  }

  // ------------------------------------------------------------- history
  function Hist() {
    return (
      <>
        <div className="kp-row"><Btn onClick={() => go("home")}><ArrowLeftIcon aria-hidden /> Volver</Btn></div>
        <section className="kp-card">
          <header>
            <div>
              <h3>Historial de pagos</h3>
              <p>Cada pago reportado y su estado</p>
            </div>
          </header>
          {usage.history.length === 0 ? (
            <p className="kp-muted">Aún no has reportado pagos.</p>
          ) : (
            usage.history.map((h) => (
              <div key={h.id} className="kp-li" style={{ flexWrap: "wrap" }}>
                <div>
                  <b>{h.title}</b>
                  <small>{formatDate(h.createdAt)}{h.reference ? ` · ref. ${h.reference}` : ""}</small>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <b className="kp-mono">{usd(h.totalUsdCents, 2)}</b>
                  <span className={`kp-st ${h.status === "APPROVED" ? "ok" : h.status === "REJECTED" ? "bad" : "warn"}`}>
                    {h.status === "APPROVED" ? "Aprobado" : h.status === "REJECTED" ? "Rechazado" : "En revisión"}
                  </span>
                </div>
              </div>
            ))
          )}
        </section>
      </>
    );
  }

  return (
    <div className="kp">
      {view === "home" && Home()}
      {view === "plans" && Plans()}
      {view === "pay" && Pay()}
      {view === "status" && Status()}
      {view === "hist" && Hist()}
    </div>
  );
}
