"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CustomerInfo = {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onContinue({ firstName, lastName, phone, address });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md mx-auto py-8">
      <div>
        <h2 className="text-xl font-semibold">Datos del cliente</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Completa los datos antes de agregar productos a la venta.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firstName">Nombre</Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            autoFocus
          />
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

      <Button type="submit" size="lg">
        Continuar
      </Button>
    </form>
  );
}
