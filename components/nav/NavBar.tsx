"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/pos", label: "Punto de venta" },
  { href: "/inventory", label: "Inventario" },
  { href: "/reports", label: "Reportes" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 border-b px-6 h-14 shrink-0">
      <span className="font-semibold mr-4">Mi Tienda</span>
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
    </nav>
  );
}
