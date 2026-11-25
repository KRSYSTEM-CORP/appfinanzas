import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MODULE_ACCESS, canAccess, canOperateCash, landingPath, type AccessSubject } from "@/lib/access";
import { DEFAULT_ROLES } from "@/lib/permissions";

const ROOT = path.resolve(__dirname, "../..");

function subjectFor(roleName: string): AccessSubject {
  const r = DEFAULT_ROLES.find((x) => x.name === roleName)!;
  return { isSuperAdmin: false, role: r.baseRole, permissions: r.permissions, allowedSections: [] };
}
const SUBJECTS: Record<string, AccessSubject> = {
  Dueño: subjectFor("Dueño"),
  Gerente: subjectFor("Gerente"),
  Cajero: subjectFor("Cajero"),
  Vendedor: subjectFor("Vendedor"),
  Contador: subjectFor("Contador"),
  "Vendedor sin rol": { isSuperAdmin: false, role: "VENDEDOR", permissions: null, allowedSections: [] },
  "Gerente sin rol": { isSuperAdmin: false, role: "GERENTE", permissions: null, allowedSections: [] },
  Superadmin: { isSuperAdmin: true, role: "GERENTE", permissions: null, allowedSections: [] },
};

// Matriz esperada rol × módulo (la que se le reportó al dueño).
const EXPECTED: Record<string, string[]> = {
  Dueño: ["home", "pos", "inventory", "quotes", "cash", "stats", "crm", "admin", "purchases", "documents", "taxbook", "payroll", "employees", "branches", "assistant", "settings", "billing", "learning"],
  Gerente: ["home", "pos", "inventory", "quotes", "cash", "stats", "crm", "admin", "purchases", "documents", "taxbook", "payroll", "employees", "branches", "assistant", "billing", "learning"],
  Cajero: ["pos", "quotes", "cash", "crm", "learning"],
  Vendedor: ["pos", "quotes", "crm", "learning"],
  Contador: ["stats", "admin", "purchases", "documents", "taxbook", "payroll", "learning"],
  "Vendedor sin rol": ["pos", "inventory", "quotes", "cash", "crm", "documents", "learning"],
  "Gerente sin rol": ["home", "pos", "inventory", "quotes", "cash", "stats", "crm", "admin", "purchases", "documents", "taxbook", "payroll", "employees", "branches", "assistant", "settings", "billing", "learning"],
  Superadmin: MODULE_ACCESS.map((m) => m.id),
};

describe("matriz rol × módulo", () => {
  for (const [who, subject] of Object.entries(SUBJECTS)) {
    it(`${who} accede exactamente a lo esperado`, () => {
      const got = MODULE_ACCESS.filter((m) => canAccess(subject, m.rule)).map((m) => m.id);
      expect(got.sort()).toEqual([...EXPECTED[who]].sort());
    });
  }

  it("el vendedor sin rol nunca hereda Administración, nómina ni libro IVA", () => {
    const s = SUBJECTS["Vendedor sin rol"];
    for (const id of ["admin", "taxbook", "payroll", "employees", "settings", "stats"]) {
      expect(canAccess(s, MODULE_ACCESS.find((m) => m.id === id)!.rule)).toBe(false);
    }
  });

  it("opera la Caja Chica (apertura, salidas, cierre) solo gerente y Cajero", () => {
    const who = Object.entries(SUBJECTS).filter(([, s]) => canOperateCash(s)).map(([n]) => n);
    expect(who.sort()).toEqual(["Cajero", "Dueño", "Gerente", "Gerente sin rol", "Superadmin"]);
  });

  it("las acciones de caja usan requireCashAccess y no requireManager", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/actions/cash-closing.ts"), "utf8");
    expect(src).not.toMatch(/requireManager\(/);
    expect(src.match(/requireCashAccess\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("quien no tiene POS aterriza en su primer módulo y nunca en uno prohibido", () => {
    for (const subject of Object.values(SUBJECTS)) {
      const href = landingPath(subject);
      const mod = MODULE_ACCESS.find((m) => m.href === href)!;
      expect(canAccess(subject, mod.rule)).toBe(true);
    }
    expect(landingPath(SUBJECTS.Contador)).toBe("/finance");
  });
});

// ---- Auditoría estática: cada página y cada acción de servidor lleva su guarda ----

function walk(dir: string, name: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, name, out);
    else if (e.name === name) out.push(p);
  }
  return out;
}

const GUARD = /require(Session|Manager|SuperAdmin|SectionAccess|Permission|AdminAccess|PurchasesAccess|AccountingPlan|ManagerPermission|CashAccess|ManagerOrPermission|AccountingManager\w*|Feature|CompanyUser|Owner|ManagerEvenIfBlocked|PayrollManager|RoleAdmin|BranchDay)\(|getSession\(|redirect\(/;

// Páginas sin guarda propia a propósito (públicas, o que solo redirigen).
const PUBLIC_PAGES = [
  "blocked", "choose-plan", "cookies", "forgot-password", "login", "lock", "privacidad", "reset-password", "signup", "terminos", "pago", "learning", "billing", "pos/offline", "customers/receivables", "inventory/[id]/movements", "app/page.tsx",
];

// Guardas exactas que debe tener cada página protegida.
const PAGE_GUARDS: Record<string, RegExp> = {
  "app/home/page.tsx": /requireManager\(/,
  "app/pos/review/page.tsx": /requireManager\(/,
  "app/inventory/page.tsx": /requireSectionAccess\("inventory"\)/,
  "app/inventory/new/page.tsx": /requireManager\(/,
  "app/inventory/import/page.tsx": /requireManager\(/,
  "app/inventory/update/page.tsx": /requireManager\(/,
  "app/inventory/[id]/page.tsx": /requireManager\(/,
  "app/inventory/transfers/page.tsx": /requireManager\(/,
  "app/quotes/page.tsx": /requireSectionAccess\("quotes"\)/,
  "app/quotes/history/page.tsx": /requireSectionAccess\("quotes"\)/,
  "app/reports/page.tsx": /requireSectionAccess\("reports"\)/,
  "app/finance/page.tsx": /requirePermission\("stats"\)/,
  "app/customers/page.tsx": /requireSectionAccess\("customers"\)/,
  "app/customers/new/page.tsx": /requireSectionAccess\("customers"\)/,
  "app/customers/promotions/page.tsx": /requireSectionAccess\("customers"\)/,
  "app/customers/[id]/page.tsx": /requireSectionAccess\("customers"\)/,
  "app/customers/[id]/crm/page.tsx": /requireSectionAccess\("customers"\)/,
  "app/accounting/page.tsx": /requirePermission\("admin"\)/,
  "app/accounting/accounts/page.tsx": /requirePermission\("admin"\)/,
  "app/accounting/cobros/page.tsx": /requirePermission\("admin"\)/,
  "app/accounting/consumption/page.tsx": /requirePermission\("admin"\)/,
  "app/accounting/gastos/page.tsx": /requirePermission\("admin"\)/,
  "app/accounting/salidas/page.tsx": /requirePermission\("admin"\)/,
  "app/accounting/statements/page.tsx": /requirePermission\("admin"\)/,
  "app/accounting/receivables/page.tsx": /requireAdminAccess\(/,
  "app/accounting/sellers/page.tsx": /requireAdminAccess\(/,
  "app/tax-book/page.tsx": /requireAdminAccess\(/,
  "app/payroll/page.tsx": /requireAdminAccess\(/,
  "app/documents/page.tsx": /requireSectionAccess\("documents"\)/,
  "app/purchases/page.tsx": /requirePurchasesAccess\(/,
  "app/purchases/new/page.tsx": /requirePurchasesAccess\(/,
  "app/purchases/orders/page.tsx": /requirePurchasesAccess\(/,
  "app/purchases/import/page.tsx": /requirePurchasesAccess\(/,
  "app/suppliers/page.tsx": /requirePurchasesAccess\(/,
  "app/suppliers/new/page.tsx": /requirePurchasesAccess\(/,
  "app/suppliers/[id]/page.tsx": /requirePurchasesAccess\(/,
  "app/suppliers/rating/page.tsx": /requirePurchasesAccess\(/,
  "app/employees/page.tsx": /requireManager\(/,
  "app/branches/page.tsx": /requireManagerPermission\("branches"\)/,
  "app/assistant/page.tsx": /requireManagerPermission\("assistant"\)/,
  "app/settings/page.tsx": /requireManagerPermission\("settings"\)/,
  "app/pos/page.tsx": /requireSession\(/,
};

describe("auditoría de páginas", () => {
  const pages = walk(path.join(ROOT, "app"), "page.tsx").map((p) => path.relative(ROOT, p));

  it("cada página protegida tiene la guarda que dice la tabla", () => {
    for (const [file, re] of Object.entries(PAGE_GUARDS)) {
      const src = fs.readFileSync(path.join(ROOT, file), "utf8");
      expect(src, file).toMatch(re);
    }
  });

  it("toda página está en la tabla, es del superadmin o está marcada como pública", () => {
    const missing = pages.filter((f) => {
      if (f.startsWith("app/admin/")) {
        return !/requireSuperAdmin\(/.test(fs.readFileSync(path.join(ROOT, f), "utf8"));
      }
      if (PAGE_GUARDS[f]) return false;
      return !PUBLIC_PAGES.some((p) => f === p || f.startsWith(`app/${p}/`) || f.includes(`/${p}/`) || f === `app/${p}/page.tsx` || f === p);
    });
    expect(missing).toEqual([]);
  });
});

// Acciones que no exigen rol a propósito: autenticación, datos de la propia sesión o de uso general del POS.
const SESSION_ONLY_OK = new Set([
  "auth.ts", "onboarding.ts", "billing.ts", "plan.ts", "pin.ts",
]);
const OPEN_ACTIONS = new Set([
  // Marcados «sin guarda propia» porque delegan en otra función guardada o son de uso general del POS.
  "learning.ts:isLearningStorageReady", "learning.ts:getLearningUploadUrl", "learning.ts:moveLearningVideo", "learning.ts:setLearningPublished", "learning.ts:getLearningStats",
  "seller-reports.ts:commissionsTotal",
]);

describe("auditoría de acciones de servidor", () => {
  const dir = path.join(ROOT, "lib/actions");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    it(`${f}: toda acción exportada tiene guarda`, () => {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      const re = /export async function (\w+)\s*\(/g;
      const idx: [string, number][] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) idx.push([m[1], m.index]);
      const bare = idx
        .filter(([name, i], k) => {
          const body = src.slice(i, k + 1 < idx.length ? idx[k + 1][1] : src.length);
          return !GUARD.test(body) && !OPEN_ACTIONS.has(`${f}:${name}`);
        })
        .map(([n]) => n);
      expect(SESSION_ONLY_OK.has(f) ? [] : bare).toEqual([]);
    });
  }

  it("ninguna acción de cuentas por cobrar o de Administración se queda en requireSession a secas", () => {
    const check = (file: string, names: string[]) => {
      const src = fs.readFileSync(path.join(ROOT, "lib/actions", file), "utf8");
      for (const n of names) {
        const i = src.indexOf(`export async function ${n}(`);
        const body = src.slice(i, i + 900);
        expect(body, `${file}:${n}`).not.toMatch(/await requireSession\(\)/);
      }
    };
    check("sales.ts", ["listRecentSales", "listReceivableSales", "registerPayment", "getSaleReceipt", "completeSale"]);
    check("statements.ts", ["getStatements", "listMovements"]);
    check("finance.ts", ["listExpenses", "createExpense", "deleteExpense", "netSalesCents"]);
    check("payroll.ts", ["listPayroll"]);
  });

  it("listPayroll usa el permiso de Administración y pagar/editar sigue siendo del gerente", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/actions/payroll.ts"), "utf8");
    const body = src.slice(src.indexOf("export async function listPayroll"), src.indexOf("export async function getPayrollProof"));
    expect(body).toMatch(/requireAdminAccess\(\)/);
    expect(body).not.toMatch(/requirePayrollManager/);
    expect(src).toMatch(/Solo el gerente puede gestionar la nómina/);
  });
});
