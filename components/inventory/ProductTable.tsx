"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Price } from "@/components/money/Price";
import { LowStockBadge } from "@/components/inventory/LowStockBadge";
import { setProductActive } from "@/lib/actions/products";

export function ProductTable({
  products,
  rate,
}: {
  products: Product[];
  rate: number | null;
}) {
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
    );
  }, [products, query]);

  function toggleActive(id: string, isActive: boolean) {
    startTransition(async () => {
      await setProductActive(id, !isActive);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Buscar por nombre o SKU..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id} className={!p.isActive ? "opacity-50" : undefined}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.sku ?? "—"}</TableCell>
                <TableCell>
                  <Price eurCents={p.priceCents} rate={rate} />
                </TableCell>
                <TableCell className="flex items-center gap-2">
                  {p.stock}
                  <LowStockBadge product={p} />
                </TableCell>
                <TableCell>{p.isActive ? "Activo" : "Inactivo"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      nativeButton={false}
                      render={<Link href={`/inventory/${p.id}`} />}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant={p.isActive ? "destructive" : "secondary"}
                      disabled={isPending}
                      onClick={() => toggleActive(p.id, p.isActive)}
                    >
                      {p.isActive ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No se encontraron productos.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
