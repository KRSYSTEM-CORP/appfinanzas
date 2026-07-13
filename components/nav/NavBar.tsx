"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";

const links = [
  { href: "/pos", label: "Punto de venta" },
  { href: "/inventory", label: "Inventario" },
  { href: "/reports", label: "Reportes" },
];

export function NavBar({ companyName }: { companyName: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 border-b px-6 h-14 shrink-0">
      <span className="font-semibold mr-4 truncate max-w-[200px]">{companyName}</span>
      {links.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
      <form action={logout} className="ml-auto">
        <Button type="submit" variant="ghost" size="sm">
          Salir
        </Button>
      </form>
    </nav>
  );
}
