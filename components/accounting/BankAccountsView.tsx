"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BanknoteIcon, CopyIcon, CreditCardIcon, LandmarkIcon, PlusIcon, SmartphoneIcon, WalletIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldPair, FIELD_CONTROL } from "@/components/shared/Field";
import { SheetActions } from "@/components/shared/ConfirmSheet";
import { SectionCard } from "@/components/shared/SectionCard";
import { savePaymentAccount, setAccountBalanceConfig } from "@/lib/actions/payment-accounts";
import { ACCOUNT_KIND_LABELS, ACCOUNT_NUMBER_LABELS, BANKS, accountClipboardText, bankLabel, bankLogoSrc, defaultBankKey, type AccountKind } from "@/lib/payment-accounts";
import { money } from "@/lib/money-display";
import { cn } from "@/lib/utils";

export type BankAccount = {
  id: string;
  kind: AccountKind;
  bankKey: string | null;
  bankName: string | null;
  holder: string | null;
  accountNumber: string;
  docId: string | null;
  currency: string; // USD | VES
  linkedMethod: string | null;
  openingCents: number;
  balanceCents: number;
};

// Métodos de cobro del POS en el orden de la preview.
const METHODS: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: "CASH", label: "Efectivo", icon: <BanknoteIcon /> },
  { id: "CARD", label: "Pago Móvil", icon: <SmartphoneIcon /> },
  { id: "POS", label: "Punto de venta", icon: <CreditCardIcon /> },
  { id: "ZELLE", label: "Zelle", icon: <WalletIcon /> },
  { id: "BINANCE", label: "Binance", icon: <WalletIcon /> },
  { id: "PAYPAL", label: "PayPal", icon: <WalletIcon /> },
  { id: "TRANSFER", label: "Transferencia", icon: <LandmarkIcon /> },
];

function Logo({ a, size = 44 }: { a: Pick<BankAccount, "bankKey" | "kind">; size?: number }) {
  const src = bankLogoSrc(a.bankKey ?? defaultBankKey(a.kind));
  return (
    <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center overflow-hidden rounded-[12px] border bg-card">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="max-h-[70%] max-w-[80%] object-contain" />
      ) : (
        <LandmarkIcon className="size-5 text-primary" aria-hidden />
      )}
    </span>
  );
}

// Administración → Cuentas Bancarias (preview): saldo por cuenta con logo, «Datos para cobrar»,
// «Agregar cuenta» y «Vincular métodos de pago a cuentas».
export function BankAccountsView({ accounts, rate, referenceCurrency }: { accounts: BankAccount[]; rate: number | null; referenceCurrency: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<BankAccount | null>(null);
  const totalRef = accounts.reduce((n, a) => n + (a.currency === "VES" ? (rate ? Math.round(a.balanceCents / rate) : 0) : a.balanceCents), 0);

  function link(a: BankAccount, method: string) {
    start(async () => {
      const r = await setAccountBalanceConfig(a.id, { currency: a.currency, openingCents: a.openingCents, linkedMethod: a.linkedMethod === method ? null : method });
      if (!r.success) toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <p className="text-muted-foreground">
          {accounts.length} cuentas · total <b className="text-foreground">{money(referenceCurrency, totalRef)}</b>
          {rate ? ` · ${money("VES", Math.round(totalRef * rate), 0)}` : ""}
        </p>
        <Button onClick={() => setAdding(true)}>
          <PlusIcon aria-hidden /> Agregar cuenta
        </Button>
      </div>

      {accounts.length === 0 ? (
        <SectionCard>
          <p className="text-[13px] text-muted-foreground">Aún no tienes cuentas. Agrega la primera para ver su saldo y vincularla a un método de pago.</p>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3">
          {accounts.map((a) => (
            <div key={a.id} className="flex min-w-0 flex-col items-start gap-1 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
              <Logo a={a} />
              <span className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{a.bankName ?? ACCOUNT_KIND_LABELS[a.kind]}</span>
              <span className="text-muted-foreground">
                {ACCOUNT_KIND_LABELS[a.kind]} · {a.currency === "VES" ? "Bolívares" : "Divisa"}
              </span>
              <b className="mt-2 break-words text-[26px] leading-tight tracking-[-0.03em] tabular-nums">{money(a.currency === "VES" ? "VES" : referenceCurrency, a.balanceCents)}</b>
              {a.currency !== "VES" && rate ? <small className="text-xs text-muted-foreground">{money("VES", Math.round(a.balanceCents * rate), 0)}</small> : null}
              <small className="mt-1 break-words text-xs text-muted-foreground">
                {[a.kind === "PAGO_MOVIL" ? `Pago Móvil ${a.accountNumber}` : a.accountNumber, a.docId].filter(Boolean).join(" · ")}
              </small>
              <button type="button" onClick={() => setDetail(a)} className="mt-2 self-center rounded-full px-2 py-1.5 text-[13px] font-semibold text-primary hover:bg-muted">
                Datos para cobrar
              </button>
            </div>
          ))}
        </div>
      )}

      {accounts.length > 0 && (
        <SectionCard title="Vincular métodos de pago a cuentas" subtitle="Puedes vincular varias cuentas a un método: el POS las muestra con su logo y datos para dictárselos al cliente">
          {METHODS.map((m) => (
            <div key={m.id} className="border-b py-3 last:border-0">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-[14px] bg-accent text-primary [&_svg]:size-5">{m.icon}</span>
                <b>{m.label}</b>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {accounts.map((a) => {
                  const on = a.linkedMethod === m.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      disabled={pending}
                      onClick={() => link(a, m.id)}
                      className={cn(
                        "inline-flex min-h-[46px] items-center gap-2.5 rounded-full border-2 py-1 pl-1.5 pr-3.5 text-[13px] font-bold transition-colors",
                        on ? "border-primary bg-accent" : "border-transparent bg-muted text-muted-foreground"
                      )}
                    >
                      <Logo a={a} size={34} />
                      {a.bankName ?? ACCOUNT_KIND_LABELS[a.kind]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </SectionCard>
      )}

      {adding && <AddAccountSheet onClose={() => setAdding(false)} onSaved={() => { setAdding(false); router.refresh(); }} />}
      {detail && <AccountDetailSheet a={detail} onClose={() => setDetail(null)} onSaved={() => { setDetail(null); router.refresh(); }} />}
    </>
  );
}

function AddAccountSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<AccountKind>("PAGO_MOVIL");
  const [bankKey, setBankKey] = useState(BANKS[0].key);
  const [holder, setHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [docId, setDocId] = useState("");
  const [pending, start] = useTransition();
  const needsBank = kind === "PAGO_MOVIL" || kind === "TRANSFER";
  function save() {
    const key = needsBank ? bankKey : defaultBankKey(kind) ?? "";
    start(async () => {
      const r = await savePaymentAccount({ kind, bankKey: key, bankName: bankLabel(key) ?? "", holder, accountNumber, docId });
      if (!r.success) toast.error(r.error);
      else {
        toast.success("Cuenta agregada");
        onSaved();
      }
    });
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar cuenta</DialogTitle>
          <DialogDescription>El POS la mostrará con su logo para dictársela al cliente.</DialogDescription>
        </DialogHeader>
        <FieldPair>
          <Field label="Tipo">
            <select className={FIELD_CONTROL} value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {(Object.keys(ACCOUNT_KIND_LABELS) as AccountKind[]).map((k) => (
                <option key={k} value={k}>
                  {ACCOUNT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          {needsBank ? (
            <Field label="Banco">
              <select className={FIELD_CONTROL} value={bankKey} onChange={(e) => setBankKey(e.target.value)}>
                {BANKS.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <span />
          )}
        </FieldPair>
        <Field label={ACCOUNT_NUMBER_LABELS[kind]}>
          <input className={FIELD_CONTROL} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
        </Field>
        <FieldPair>
          <Field label="Cédula o RIF">
            <input className={FIELD_CONTROL} value={docId} onChange={(e) => setDocId(e.target.value)} placeholder="J-12345678-9" />
          </Field>
          <Field label="Titular">
            <input className={FIELD_CONTROL} value={holder} onChange={(e) => setHolder(e.target.value)} />
          </Field>
        </FieldPair>
        <SheetActions>
          <Button disabled={pending || accountNumber.trim().length < 3} onClick={save}>
            Guardar cuenta
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </SheetActions>
      </DialogContent>
    </Dialog>
  );
}

function AccountDetailSheet({ a, onClose, onSaved }: { a: BankAccount; onClose: () => void; onSaved: () => void }) {
  const [cur, setCur] = useState(a.currency);
  const [opening, setOpening] = useState((a.openingCents / 100).toFixed(2));
  const [pending, start] = useTransition();
  const text = accountClipboardText(a);
  function save() {
    start(async () => {
      const r = await setAccountBalanceConfig(a.id, {
        currency: cur,
        openingCents: Math.round((parseFloat(opening.replace(",", ".")) || 0) * 100),
        linkedMethod: a.linkedMethod,
      });
      if (!r.success) toast.error(r.error);
      else onSaved();
    });
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Datos para cobrar</DialogTitle>
          <DialogDescription>{a.bankName ?? ACCOUNT_KIND_LABELS[a.kind]}</DialogDescription>
        </DialogHeader>
        <pre className="mt-3 whitespace-pre-wrap rounded-[16px] bg-muted p-3.5 font-sans text-sm">{text}</pre>
        <FieldPair>
          <Field label="Moneda del saldo">
            <select className={FIELD_CONTROL} value={cur} onChange={(e) => setCur(e.target.value)}>
              <option value="USD">Divisa</option>
              <option value="VES">Bolívares</option>
            </select>
          </Field>
          <Field label="Saldo inicial">
            <input className={FIELD_CONTROL} inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
          </Field>
        </FieldPair>
        <SheetActions>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                toast.success("Datos copiados");
              } catch {
                toast.error("No se pudo copiar");
              }
            }}
          >
            <CopyIcon aria-hidden /> Copiar datos
          </Button>
          <Button disabled={pending} onClick={save}>
            Guardar saldo
          </Button>
        </SheetActions>
      </DialogContent>
    </Dialog>
  );
}
