"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchCustomers } from "@/lib/actions/customers";
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
};

export function CustomerForm({
  initial,
  onContinue,
}: {
  initial?: CustomerInfo;
  onContinue: (customer: CustomerInfo) => void;
}) {
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [rif, setRif] = useState(initial?.rif ?? "");
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
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onContinue({ firstName, lastName, phone, address, rif });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 max-w-md mx-auto my-8 rounded-xl border bg-card p-6 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center size-9 shrink-0 rounded-lg bg-primary/10 text-primary">
          <UserIcon className="size-4.5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold leading-tight">Datos del cliente</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Un dato rápido y pasas directo al catálogo.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5 relative">
          <Label htmlFor="firstName">Nombre</Label>
          <Input
            id="firstName"
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
            autoComplete="off"
          />
          {showSuggestions && visibleSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-10 rounded-md border bg-popover shadow-md overflow-hidden">
              {visibleSuggestions.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onMouseDown={() => pickSuggestion(c)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                >
                  <span className="font-medium">
                    {c.firstName} {c.lastName}
                  </span>
                  <span className="block text-xs text-muted-foreground">{c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lastName">Apellido</Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Número de teléfono</Label>
        <Input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address">Dirección</Label>
        <Input
          id="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rif">Cédula/RIF (opcional)</Label>
        <Input id="rif" value={rif} onChange={(e) => setRif(e.target.value)} autoComplete="off" />
        <p className="text-xs text-muted-foreground">Ej. V-12345678 o J-12345678-9</p>
      </div>

      <Button type="submit" size="lg" className="w-full">
        Ver catálogo
      </Button>
    </form>
  );
}
