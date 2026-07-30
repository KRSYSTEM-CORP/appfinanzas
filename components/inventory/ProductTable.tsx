"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Price } from "@/components/money/Price";
import { LowStockBadge } from "@/components/inventory/LowStockBadge";
import { deleteProduct, setProductActive } from "@/lib/actions/products";
import type { ReferenceCurrency } from "@prisma/client";

const ALL_CATEGORIES = "__all__";

export function ProductTable({
  products,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  categories,
}: {
  products: Product[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  categories: string[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const matchesQuery =
        !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
      const matchesCategory = category === ALL_CATEGORIES || p.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [products, query, category]);

  function toggleActive(id: string, isActive: boolean) {
    startTransition(async () => {
      await setProductActive(id, !isActive);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteProduct(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder="Buscar por nombre o SKU..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select value={category} onValueChange={(v) => setCategory(v ?? ALL_CATEGORIES)}>
          <SelectTrigger>
            <SelectValue placeholder="Categoría">
              {(value: string | null) =>
                !value || value === ALL_CATEGORIES ? "Todas las categorías" : value
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>Todas las categorías</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id} className={!p.isActive ? "opacity-50" : undefined}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {p.imageDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageDataUrl} alt="" className="h-8 w-8 rounded object-cover border shrink-0" />
                    ) : (
                      <div className="h-8 w-8 rounded border bg-muted shrink-0" />
                    )}
                    {p.name}
                  </div>
                </TableCell>
                <TableCell>{p.sku ?? "—"}</TableCell>
                <TableCell>{p.category ?? "—"}</TableCell>
                <TableCell>
                  <Price
                    eurCents={p.priceCents}
                    rate={rate}
                    currencyCode={currencyCode}
                    exchangeRateEnabled={exchangeRateEnabled}
                    referenceCurrency={referenceCurrency}
                  />
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
                    <Dialog>
                      <DialogTrigger render={<Button size="sm" variant="destructive" disabled={isPending} />}>
                        Eliminar
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>¿Eliminar &quot;{p.name}&quot;?</DialogTitle>
                          <DialogDescription>
                            Esta acción es irreversible. El producto desaparecerá del inventario y
                            del punto de venta. Las ventas y presupuestos ya generados con este
                            producto no se ven afectados.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                          <DialogClose
                            render={<Button variant="destructive" disabled={isPending} />}
                            onClick={() => handleDelete(p.id)}
                          >
                            Eliminar
                          </DialogClose>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
