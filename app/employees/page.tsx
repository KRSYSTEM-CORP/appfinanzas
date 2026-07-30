import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeTable } from "@/components/employees/EmployeeTable";
import { listEmployees } from "@/lib/actions/employees";
import { listBranches } from "@/lib/actions/branches";
import { requireManager } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const session = await requireManager();
  const [employees, company, branches] = await Promise.all([
    listEmployees(),
    prisma.company.findUnique({ where: { id: session.companyId }, select: { loginCode: true } }),
    listBranches(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Administración de perfiles</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crea y administra los perfiles de tus empleados: gerentes y vendedores.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Código de empresa</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-2xl font-mono font-semibold tracking-wider">{company?.loginCode}</p>
          <p className="text-sm text-muted-foreground">
            Comparte este código con tus empleados. Junto con su nombre, apellido y contraseña, les
            permite iniciar sesión desde la pestaña &quot;Soy empleado&quot; en la pantalla de acceso.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Empleados</CardTitle>
        </CardHeader>
        <CardContent>
          <EmployeeTable employees={employees} currentUserId={session.userId} branches={branches} />
        </CardContent>
      </Card>
    </div>
  );
}
