import NextLink from "next/link";
import type { ComponentProps } from "react";

// Link sin prefetch por defecto. Cada prefetch de una ruta dinámica ejecuta en el
// servidor el layout completo (unas 20 consultas) y una pantalla llegaba a lanzar
// 20-30 de ellos; con `loading.tsx` la navegación ya responde al instante.
// Se puede reactivar en un enlace concreto con prefetch={true}.
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
