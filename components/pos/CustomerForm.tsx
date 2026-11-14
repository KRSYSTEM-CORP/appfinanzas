"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePosCustomer, searchCustomers } from "@/lib/actions/customers";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
import type { Customer } from "@prisma/client";

export type CustomerInfo = {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  // Cédula/RIF — optional, only useful for a Factura the customer wants to
  // deduct/declare; most retail sales stay "Consumidor Final" without one.
  rif: string;
  birthDate?: string;
  email?: string;
};

export function CustomerForm({
  initial,
  onContinue,
  title = "Datos del cliente",
  subtitle = "Un dato rápido y pasas directo al catálogo.",
  submitLabel = "Continuar al catálogo",
  bare = false,
  onCancel,
}: {
  initial?: CustomerInfo;
  onContinue: (customer: CustomerInfo) => void;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  // Sin tarjeta propia: para mostrarlo dentro de un diálogo.
  bare?: boolean;
  onCancel?: () => void;
}) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [rif, setRif] = useState(initial?.rif ?? "");
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [, startSearch] = useTransition();
  const requestId = useRef(0);
  const online = useOnlineStatus();
  // Offline there is nothing to suggest, whatever was fetched earlier.
  const visibleSuggestions = online ? suggestions : [];

  useEffect(() => {
    const query = firstName.trim();
    // The autocomplete is a convenience, not a requirement — every field here
    // stays manually typeable, so skip the server round-trip entirely while
    // offline rather than let it fail. searchCustomers is a Server Action
    // (a fetch under the hood); this app has no error boundary anywhere, so
    // an uncaught rejection here could otherwise blank the whole checkout
    // screen at the worst possible moment.
    if (query.length < 2 || !online) return;
    const id = ++requestId.current;
    const timeout = setTimeout(() => {
      startSearch(async () => {
        try {
          const results = await searchCustomers(query);
          if (id === requestId.current) {
            setSuggestions(results);
            setShowSuggestions(true);
          }
        } catch {
          // Connection dropped mid-search — silently give up on suggestions,
          // the cashier can just keep typing.
          if (id === requestId.current) setSuggestions([]);
        }
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [firstName, online]);

  function pickSuggestion(customer: Customer) {
    setFirstName(customer.firstName);
    setLastName(customer.lastName);
    setPhone(customer.phone);
    setAddress(customer.address ?? "");
    setRif(customer.rif ?? "");
    setEmail(customer.email ?? "");
    setBirthDate(customer.birthDate ? new Date(customer.birthDate).toISOString().slice(0, 10) : "");
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const info = { firstName, lastName, phone, address, rif, birthDate, email };
    // En línea se guarda en el CRM con nacimiento y correo; sin conexión la venta sigue igual.
    if (online) {
      void savePosCustomer({ firstName, lastName, phone, address, rif, birthDate, email }).catch(() => undefined);
    }
    onContinue(info);
  }

  const fieldInput =
    "h-11 rounded-[12px] border-border bg-background px-3 text-[13px] font-semibold placeholder:text-muted-foreground";
  const fieldLabel = "text-[13px] font-semibold";

  return (
    <form
      onSubmit={handleSubmit}
      className={
        bare
          ? "flex w-full flex-col gap-2.5"
          : "mx-auto my-3 flex w-full max-w-2xl flex-col gap-2.5 rounded-[19px] bg-card p-4 shadow-(--shadow-card) min-[400px]:my-4 min-[400px]:p-5 sm:my-6 sm:p-7"
      }
    >
      {!bare && (
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-primary/12 text-primary">
            <UserIcon className="size-[22px]" />
          </div>
          <div>
            <h2 className="text-lg font-bold leading-tight tracking-tight">{title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5 min-[400px]:grid-cols-2">
        <div className="relative flex flex-col gap-1">
          <Label htmlFor="firstName" className={fieldLabel}>Nombre *</Label>
          <Input
            id="firstName"
            className={fieldInput}
            value={firstName}
            onChange={(e) => {
              const value = e.target.value;
              setFirstName(value);
              if (value.trim().length < 2) setSuggestions([]);
            }}
            onFocus={() => setShowSuggestions(visibleSuggestions.length > 0)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            required
            autoFocus
            autoComplete="given-name"
          />
          {showSuggestions && visibleSuggestions.length > 0 && (
            <div className="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-[14px] bg-popover shadow-(--shadow-float)">
              {visibleSuggestions.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onMouseDown={() => pickSuggestion(c)}
                  className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span className="font-semibold">
                    {c.firstName} {c.lastName}
                  </span>
                  <span className="block text-xs text-muted-foreground">{c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="lastName" className={fieldLabel}>Apellido *</Label>
          <Input id="lastName" className={fieldInput} value={lastName} onChange={(e) => setLastName(e.target.value)} required autoComplete="family-name" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 min-[400px]:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="rif" className={fieldLabel}>Cédula (opcional)</Label>
          <Input id="rif" className={fieldInput} inputMode="numeric" placeholder="V-00000000" value={rif} onChange={(e) => setRif(e.target.value)} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="phone" className={fieldLabel}>Teléfono *</Label>
          <Input id="phone" className={fieldInput} type="tel" inputMode="tel" placeholder="0412-000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} required autoComplete="off" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="address" className={fieldLabel}>Dirección *</Label>
        <Input id="address" className={fieldInput} value={address} onChange={(e) => setAddress(e.target.value)} required autoComplete="street-address" />
      </div>

      <div className="grid grid-cols-1 gap-2.5 min-[400px]:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="birthDate" className={fieldLabel}>Fecha de nacimiento (opcional)</Label>
          <Input id="birthDate" className={fieldInput} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="email" className={fieldLabel}>Correo (opcional)</Label>
          <Input id="email" className={fieldInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground">Nombre, apellido, dirección y teléfono son obligatorios.</p>

      <div className="mt-1 flex flex-wrap gap-2">
        <Button type="submit">{submitLabel}</Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
