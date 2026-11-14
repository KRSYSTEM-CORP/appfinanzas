"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BanknoteIcon, CreditCardIcon, LandmarkIcon, SmartphoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard, ListRow } from "@/components/shared/SectionCard";
import { Field, FieldPair, FIELD_CONTROL } from "@/components/shared/Field";
import { SheetActions } from "@/components/shared/ConfirmSheet";
import { Switch } from "@/components/settings/SettingsUi";
import { PaymentAccountsList } from "@/components/payments/PaymentAccountsList";
import {
  BANKS,
  ACCOUNT_NUMBER_LABELS,
  bankLabel,
  defaultBankKey,
  settingsMethods,
  type AccountKind,
  type SettingsMethod,
  type SettingsMethodIcon,
} from "@/lib/payment-accounts";
import { getCurrency } from "@/lib/currencies";
import {
  deletePaymentAccount,
  savePaymentAccount,
  setPaymentAccountsActiveByKind,
  type PaymentAccountRow,
} from "@/lib/actions/payment-accounts";

const ICONS = { cash: BanknoteIcon, phone: SmartphoneIcon, card: CreditCardIcon, bank: LandmarkIcon } as const;

// Logo del método (.lg de la preview): logo de Zelle/Binance/PayPal en caja blanca de 68×46, o icono
// en cuadro suave de 46×46.
function MethodLogo({ icon, alt }: { icon: SettingsMethodIcon; alt: string }) {
  if (icon === "zelle" || icon === "binance" || icon === "paypal") {
    return (
      <span className="inline-flex h-[46px] w-[68px] flex-none items-center justify-center overflow-hidden rounded-[14px] bg-white px-2 py-1.5 shadow-[inset_0_0_0_1px_rgba(20,22,31,.1)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/banks/${icon}.png`} alt={alt} className="size-full object-contain" />
      </span>
    );
  }
  const Icon = ICONS[icon];
  return (
    <span className="inline-flex size-[46px] flex-none items-center justify-center rounded-[14px] bg-accent text-primary">
      <Icon className="size-[22px]" aria-hidden />
    </span>
  );
}

// Ajustes → Pagos y Moneda → «Métodos de pago»: una fila por método con su moneda, si tiene datos
// cargados, «Editar» (hoja con las cuentas que verá el cliente) e interruptor que muestra u oculta
// en el POS las cuentas de ese tipo.
export function PaymentMethodsCard({
  accounts,
  exchangeRateEnabled,
  localCurrencyCode,
}: {
  accounts: PaymentAccountRow[];
  exchangeRateEnabled: boolean;
  localCurrencyCode: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<SettingsMethod | null>(null);
  const [isPending, startTransition] = useTransition();
  const localName = getCurrency(localCurrencyCode).name.split(" (")[0].toLowerCase();

  function toggle(kind: AccountKind, active: boolean) {
    startTransition(async () => {
      const r = await setPaymentAccountsActiveByKind(kind, active);
      if (r.success) {
        toast.success(active ? "Método visible en el punto de venta" : "Método oculto en el punto de venta");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <SectionCard title="Métodos de pago" subtitle="Lo que ofreces al cobrar. Bolívares se cobran en Bs; divisas en $ con su referencia en Bs">
      {settingsMethods(exchangeRateEnabled).map((m) => {
        const mine = m.kind ? accounts.filter((a) => a.kind === m.kind) : [];
        const active = mine.some((a) => a.active);
        const data = m.kind === null ? "No necesita datos" : mine.length > 0 ? "Datos cargados" : "Sin datos cargados";
        return (
          <ListRow key={m.id}>
            <div className="flex items-center gap-2.5">
              <MethodLogo icon={m.icon} alt={m.label} />
              <span>
                <b>{m.label}</b>
                <small>
                  Moneda: {m.foreign ? "divisa" : localName} · {data}
                </small>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setEditing(m)}>
                Editar
              </Button>
              {m.kind === null ? (
                <Switch on readOnly label={`${m.label}: siempre disponible`} />
              ) : (
                <Switch on={active} disabled={isPending || mine.length === 0} onChange={(v) => toggle(m.kind!, v)} label={`${m.label}: mostrar en el punto de venta`} />
              )}
            </div>
          </ListRow>
        );
      })}
      {editing && <MethodSheet key={editing.id} method={editing} accounts={accounts.filter((a) => a.kind === editing.kind)} onClose={() => setEditing(null)} />}
    </SectionCard>
  );
}

function MethodSheet({ method, accounts, onClose }: { method: SettingsMethod; accounts: PaymentAccountRow[]; onClose: () => void }) {
  const router = useRouter();
  const kind = method.kind;
  const [editing, setEditing] = useState<PaymentAccountRow | "new" | null>(kind && accounts.length === 0 ? "new" : null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove(id: string) {
    startTransition(async () => {
      const r = await deletePaymentAccount(id);
      setConfirmId(null);
      if (r.success) {
        toast.success("Cuenta eliminada");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{method.label}</DialogTitle>
          <DialogDescription>Datos que verá el cliente al pagar</DialogDescription>
        </DialogHeader>
        {kind === null ? (
          <>
            <p className="text-muted-foreground">Este método no necesita datos.</p>
            <SheetActions>
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
            </SheetActions>
          </>
        ) : editing ? (
          <AccountFields
            key={editing === "new" ? "new" : editing.id}
            kind={kind}
            account={editing === "new" ? null : editing}
            onCancel={() => (accounts.length === 0 ? onClose() : setEditing(null))}
            onSaved={() => {
              router.refresh();
              if (accounts.length === 0 || editing !== "new") onClose();
              else setEditing(null);
            }}
          />
        ) : (
          <>
            <PaymentAccountsList
              accounts={accounts}
              actions={(a) => (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                    Editar
                  </Button>
                  {confirmId === a.id ? (
                    <Button size="sm" variant="destructive" disabled={isPending} onClick={() => remove(a.id)}>
                      Sí, eliminar
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(a.id)}>
                      Eliminar
                    </Button>
                  )}
                </>
              )}
            />
            <SheetActions>
              <Button onClick={() => setEditing("new")}>Agregar cuenta</Button>
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
            </SheetActions>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AccountFields({
  kind,
  account,
  onCancel,
  onSaved,
}: {
  kind: AccountKind;
  account: PaymentAccountRow | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const needsBank = kind === "PAGO_MOVIL" || kind === "TRANSFER";
  const [bankKey, setBankKey] = useState(account?.bankKey ?? "");
  const [holder, setHolder] = useState(account?.holder ?? "");
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? "");
  const [docId, setDocId] = useState(account?.docId ?? "");
  const [note, setNote] = useState(account?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    const key = needsBank ? bankKey : defaultBankKey(kind) ?? "";
    startTransition(async () => {
      const result = await savePaymentAccount(
        { kind, bankKey: key, bankName: bankLabel(key) ?? "", holder, accountNumber, docId, note },
        account?.id
      );
      if (result.success) {
        toast.success("Datos guardados");
        onSaved();
      } else setError(result.error);
    });
  }

  return (
    <div>
      {needsBank && (
        <Field label="Banco">
          <select value={bankKey} onChange={(e) => setBankKey(e.target.value)} className={FIELD_CONTROL}>
            <option value="">Selecciona un banco</option>
            {BANKS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={ACCOUNT_NUMBER_LABELS[kind]}>
        <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={FIELD_CONTROL} />
      </Field>
      <FieldPair>
        <Field label="Cédula o RIF (opcional)">
          <input value={docId} onChange={(e) => setDocId(e.target.value)} className={FIELD_CONTROL} />
        </Field>
        <Field label="Titular (opcional)">
          <input value={holder} onChange={(e) => setHolder(e.target.value)} className={FIELD_CONTROL} />
        </Field>
      </FieldPair>
      <Field label="Nota (opcional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Solo en horario de oficina" className={FIELD_CONTROL} />
      </Field>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <SheetActions>
        <Button disabled={isPending} onClick={save}>
          Guardar
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </SheetActions>
    </div>
  );
}
