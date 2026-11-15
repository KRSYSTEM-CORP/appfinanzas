import { redirect } from "next/navigation";

// Cuentas por cobrar ahora vive en Administración.
export default function CustomersReceivablesRedirect(): never {
  redirect("/accounting/receivables");
}
