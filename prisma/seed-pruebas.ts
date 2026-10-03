// Datos de ejemplo para una base de PRUEBAS (nunca producción).
// Uso: set -a; . ./.env.pruebas; set +a; npx tsx prisma/seed-pruebas.ts
// Borra la empresa "PRUEBA1" y la recrea completa, así que se puede repetir.
import "dotenv/config";
import { PrismaClient, type Customer, type PaymentMethod, type Product, type Supplier, type TaxCategory } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../lib/password";

const url = process.env.DATABASE_URL ?? "";
if (!url || url.includes("ep-rapid-hat")) {
  throw new Error("Esta base parece de producción o no está definida. Abortado.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const LOGIN_CODE = "PRUEBA1";
const MANAGER_EMAIL = "gerente@pruebas.test";
const SELLER_EMAIL = "ana@pruebas.test";
const PASSWORD = "Pruebas2026!";
const RATE = 97.5; // VES por EUR, valor de ejemplo

const daysAgo = (d: number, h = 11) => {
  const x = new Date();
  x.setDate(x.getDate() - d);
  x.setHours(h, 15, 0, 0);
  return x;
};
const inDays = (d: number) => daysAgo(-d);

async function main() {
  await prisma.company.deleteMany({ where: { loginCode: LOGIN_CODE } });
  await prisma.user.deleteMany({ where: { email: { in: [MANAGER_EMAIL, SELLER_EMAIL, "luis@pruebas.test"] } } });

  const company = await prisma.company.create({
    data: {
      name: "Comercial Pruebas",
      loginCode: LOGIN_CODE,
      exchangeRate: RATE,
      exchangeRateUpdatedAt: new Date(),
      fiscalLegalName: "Comercial Pruebas C.A.",
      fiscalRif: "J-12345678-9",
      fiscalAddress: "Av. Principal, Caracas",
      fiscalPhone: "0212-5550000",
      monthlyFeeUsdCents: 1500,
      nextPaymentDueDate: inDays(18),
    },
  });
  const cid = company.id;
  const main = await prisma.branch.create({ data: { companyId: cid, name: "Sucursal Principal" } });
  const norte = await prisma.branch.create({ data: { companyId: cid, name: "Sucursal Norte" } });
  await prisma.branch.create({ data: { companyId: cid, name: "Sucursal Vieja", isActive: false } });
  const bid = main.id;

  const manager = await prisma.user.create({
    data: {
      email: MANAGER_EMAIL, passwordHash: hashPassword(PASSWORD), companyId: cid,
      firstName: "Gabriela", lastName: "Rojas", role: "GERENTE", hasSeenTour: true,
    },
  });
  const seller = await prisma.user.create({
    data: {
      email: SELLER_EMAIL, passwordHash: hashPassword(PASSWORD), companyId: cid, branchId: bid,
      firstName: "Ana", lastName: "Pérez", role: "VENDEDOR", commissionPercent: 3, hasSeenTour: true,
    },
  });
  await prisma.user.create({
    data: {
      email: "luis@pruebas.test", passwordHash: hashPassword(PASSWORD), companyId: cid, branchId: norte.id,
      firstName: "Luis", lastName: "Mora", role: "VENDEDOR", status: "SUSPENDED", hasSeenTour: true,
    },
  });

  // ---- Productos
  const productSeed: [string, string, string, number, number, number, number, boolean, TaxCategory][] = [
    ["Playera básica blanca", "PLB-BLA", "Ropa", 2500, 1200, 40, 10, true, "GENERAL"],
    ["Playera básica negra", "PLB-NEG", "Ropa", 2500, 1200, 35, 10, true, "GENERAL"],
    ["Playera estampada", "PLE-001", "Ropa", 3200, 1600, 8, 10, true, "GENERAL"],
    ["Pantalón de mezclilla", "PAN-MEZ", "Ropa", 6500, 3200, 20, 5, true, "GENERAL"],
    ["Pantalón deportivo", "PAN-DEP", "Ropa", 4500, 2200, 4, 5, true, "GENERAL"],
    ["Sudadera con gorro", "SUD-GOR", "Ropa", 5800, 2900, 15, 5, true, "GENERAL"],
    ["Chamarra ligera", "CHA-LIG", "Ropa", 8900, 4500, 3, 4, true, "GENERAL"],
    ["Gorra ajustable", "GOR-AJU", "Accesorios", 1500, 600, 50, 10, true, "REDUCED"],
    ["Calcetines (par)", "CAL-PAR", "Accesorios", 600, 250, 100, 20, true, "REDUCED"],
    ["Tenis casuales", "TEN-CAS", "Calzado", 12000, 6500, 2, 3, true, "GENERAL"],
    ["Cinturón de piel", "CIN-PIE", "Accesorios", 3500, 1500, 12, 5, true, "GENERAL"],
    ["Bolsa tote", "BOL-TOT", "Accesorios", 4200, 2000, 0, 3, true, "GENERAL"],
    ["Producto descontinuado", "DES-001", "Ropa", 1000, 400, 5, 2, false, "EXEMPT"],
  ];
  const products: Product[] = [];
  for (const [name, sku, category, priceCents, costCents, stock, low, isActive, taxCategory] of productSeed) {
    products.push(
      await prisma.product.create({
        data: { companyId: cid, branchId: bid, name, sku, category, priceCents, costCents, stock, lowStockThreshold: low, isActive, taxCategory },
      })
    );
  }

  // ---- Clientes y proveedores
  const customerSeed = [
    ["María", "Pérez", "0414-1112233", "V-12345678"],
    ["José", "Rodríguez", "0424-2223344", "V-23456789"],
    ["Carmen", "Salazar", "0412-3334455", null],
    ["Distribuidora", "El Sol", "0212-4445566", "J-30123456-7"],
    ["Pedro", "Linares", "0416-5556677", "V-9876543"],
  ] as const;
  const customers: Customer[] = [];
  for (const [firstName, lastName, phone, rif] of customerSeed) {
    customers.push(
      await prisma.customer.create({
        data: { companyId: cid, firstName, lastName, phone, rif, address: "Caracas", nextContactDate: inDays(5) },
      })
    );
  }
  const supplierSeed = [
    ["Textiles Andinos C.A.", "J-40111222-3", "0212-7771111", "ventas@andinos.test"],
    ["Importadora Costa", "J-40222333-4", "0261-7772222", null],
    ["Calzados del Este", "J-40333444-5", "0241-7773333", "pedidos@calzados.test"],
  ] as const;
  const suppliers: Supplier[] = [];
  for (const [name, rif, phone, email] of supplierSeed) {
    suppliers.push(await prisma.supplier.create({ data: { companyId: cid, name, rif, phone, email } }));
  }

  // ---- Ventas
  type SaleOpts = {
    day: number; customer?: number; picks: [number, number][]; method?: PaymentMethod;
    credit?: boolean; paidCents?: number; voided?: boolean; sellerIsAna?: boolean; quoteId?: string;
  };
  let control = 1;
  const makeSale = async (o: SaleOpts) => {
    const c = o.customer != null ? customers[o.customer] : null;
    let total = 0, base = 0, tax = 0;
    const items = o.picks.map(([pi, qty]) => {
      const p = products[pi];
      const subtotal = p.priceCents * qty;
      const rate = p.taxCategory === "GENERAL" ? 16 : p.taxCategory === "REDUCED" ? 8 : 0;
      const b = Math.round(subtotal / (1 + rate / 100));
      total += subtotal; base += b; tax += subtotal - b;
      return {
        productId: p.id, productName: p.name, category: p.category, unitPriceCents: p.priceCents, quantity: qty,
        subtotalCents: subtotal, taxCategory: p.taxCategory, taxRatePercent: rate, baseCents: b, taxCents: subtotal - b,
      };
    });
    const when = daysAgo(o.day, 9 + (control % 9));
    const method = o.method ?? "CASH";
    const payments: { paymentMethod: PaymentMethod; amountEurCents: number; createdAt: Date; exchangeRate: number }[] = [];
    if (!o.credit) payments.push({ paymentMethod: method, amountEurCents: total, createdAt: when, exchangeRate: RATE });
    else if (o.paidCents) payments.push({ paymentMethod: method, amountEurCents: o.paidCents, createdAt: daysAgo(Math.max(o.day - 2, 0)), exchangeRate: RATE });
    const who = o.sellerIsAna ? seller : manager;
    return prisma.sale.create({
      data: {
        companyId: cid, branchId: bid, createdAt: when, totalCents: total, baseImponibleCents: base, taxCents: tax,
        paymentMethod: o.credit ? null : method, exchangeRate: RATE, controlNumber: control, invoiceNumber: control % 2 ? control : null,
        paymentStatus: o.credit ? "CREDIT" : "PAID", paidAt: o.credit ? null : when, paidExchangeRate: o.credit ? null : RATE,
        voided: !!o.voided, voidedAt: o.voided ? when : null, sellerId: who.id, sellerName: `${who.firstName} ${who.lastName}`,
        customerId: c?.id, customerFirstName: c?.firstName, customerLastName: c?.lastName, customerPhone: c?.phone,
        customerRif: c?.rif, quoteId: o.quoteId, items: { create: items }, payments: { create: payments },
      },
    }).then((s) => { control++; return s; });
  };

  const methods: PaymentMethod[] = ["CASH", "CARD", "ZELLE", "TRANSFER", "POS", "CASH"];
  for (let i = 0; i < 16; i++) {
    await makeSale({
      day: 1 + i * 2,
      customer: i % 5,
      picks: [[i % 12, 1 + (i % 3)], [(i + 4) % 12, 1]],
      method: methods[i % methods.length],
      sellerIsAna: i % 3 === 0,
    });
  }
  // A crédito: sin abonos, con abono parcial, antigua, y una anulada
  await makeSale({ day: 25, customer: 3, picks: [[3, 4], [5, 3]], credit: true });
  await makeSale({ day: 12, customer: 0, picks: [[9, 1], [0, 2]], credit: true, paidCents: 6000, method: "TRANSFER" });
  await makeSale({ day: 6, customer: 1, picks: [[2, 2]], credit: true, sellerIsAna: true });
  await makeSale({ day: 3, customer: 4, picks: [[6, 1], [10, 2]], credit: true, paidCents: 3000 });
  await makeSale({ day: 8, customer: 2, picks: [[1, 1]], voided: true });

  // ---- Presupuestos
  const makeQuote = async (day: number, cust: number, picks: [number, number][], status: "PENDING" | "CONVERTED" | "LOST", n: number) => {
    let total = 0;
    const items = picks.map(([pi, qty]) => {
      const p = products[pi];
      total += p.priceCents * qty;
      return { productId: p.id, productName: p.name, category: p.category, unitPriceCents: p.priceCents, quantity: qty, subtotalCents: p.priceCents * qty };
    });
    const c = customers[cust];
    return prisma.quote.create({
      data: {
        companyId: cid, branchId: bid, createdAt: daysAgo(day), controlNumber: n, totalCents: total, exchangeRate: RATE,
        customerFirstName: c.firstName, customerLastName: c.lastName, customerPhone: c.phone, sellerId: manager.id,
        sellerName: "Gabriela Rojas", status, items: { create: items },
      },
    });
  };
  await makeQuote(2, 0, [[3, 2], [0, 3]], "PENDING", 1);
  await makeQuote(9, 3, [[5, 10]], "PENDING", 2);
  await makeQuote(20, 1, [[9, 1]], "PENDING", 3);
  const converted = await makeQuote(14, 4, [[7, 6], [8, 12]], "CONVERTED", 4);
  await makeSale({ day: 13, customer: 4, picks: [[7, 6], [8, 12]], quoteId: converted.id });
  await makeQuote(30, 2, [[6, 2]], "LOST", 5);
  await makeQuote(40, 0, [[4, 3]], "LOST", 6);

  // ---- Compras
  let pcontrol = 1;
  const makePurchase = async (day: number, sup: number | null, picks: [number, number][], paid: boolean, voided = false) => {
    let total = 0, base = 0, tax = 0;
    const items = picks.map(([pi, qty]) => {
      const p = products[pi];
      const cost = p.costCents ?? 1000;
      const b = cost * qty;
      const t = Math.round(b * 0.16);
      total += b + t; base += b; tax += t;
      return { productId: p.id, productName: p.name, unitCostCents: cost, quantity: qty, baseCents: b, taxCents: t, subtotalCents: b + t, taxCategory: "GENERAL" as TaxCategory, taxRatePercent: 16 };
    });
    return prisma.purchase.create({
      data: {
        companyId: cid, branchId: bid, supplierId: sup != null ? suppliers[sup].id : null,
        manualSupplierName: sup == null ? "Proveedor ocasional" : null, controlNumber: pcontrol,
        supplierInvoiceNo: `F-${1000 + pcontrol}`, createdAt: daysAgo(day), totalCents: total, baseImponibleCents: base, taxCents: tax,
        paymentStatus: paid ? "PAID" : "PENDING", paidAt: paid ? daysAgo(day) : null, voided, voidedAt: voided ? daysAgo(day) : null,
        items: { create: items },
        payments: paid ? { create: [{ paymentMethod: "TRANSFER", amountEurCents: total, exchangeRate: RATE, createdAt: daysAgo(day) }] } : undefined,
      },
    }).then((r) => { pcontrol++; return r; });
  };
  await makePurchase(28, 0, [[0, 30], [1, 30]], true);
  await makePurchase(15, 2, [[9, 10]], true);
  await makePurchase(5, 1, [[7, 40], [8, 80]], false);
  await makePurchase(2, null, [[3, 12]], false);
  await makePurchase(20, 0, [[5, 10]], true, true);

  // ---- Gastos
  const expenseSeed: [string, string, number, number][] = [
    ["Alquiler del local", "Alquiler", 30000, 27],
    ["Electricidad", "Servicios", 4500, 18],
    ["Internet", "Servicios", 2500, 17],
    ["Bolsas y empaques", "Insumos", 1800, 9],
    ["Nómina quincena", "Nómina", 22000, 4],
  ];
  for (const [description, category, amountCents, d] of expenseSeed) {
    await prisma.expense.create({ data: { companyId: cid, description, category, amountCents, spentAt: daysAgo(d), createdById: manager.id } });
  }

  // ---- Reportes de pago de suscripción
  await prisma.paymentReport.create({
    data: {
      companyId: cid, reportedById: manager.id, status: "PENDING", note: "Pago de octubre", createdAt: daysAgo(1),
      lines: { create: [{ paymentMethod: "ZELLE", amountUsdCents: 1000, reference: "ZL-88123" }, { paymentMethod: "TRANSFER", amountUsdCents: 500, reference: "0102-445566" }] },
    },
  });
  await prisma.paymentReport.create({
    data: {
      companyId: cid, reportedById: manager.id, status: "APPROVED", reviewedById: manager.id, reviewedAt: daysAgo(30),
      reviewNote: "Recibido, gracias", createdAt: daysAgo(32),
      lines: { create: [{ paymentMethod: "ZELLE", amountUsdCents: 1500, reference: "ZL-77001" }] },
    },
  });
  await prisma.paymentReport.create({
    data: {
      companyId: cid, reportedById: manager.id, status: "REJECTED", reviewedById: manager.id, reviewedAt: daysAgo(60),
      reviewNote: "El comprobante no coincide con el monto", createdAt: daysAgo(62),
      lines: { create: [{ paymentMethod: "TRANSFER", amountUsdCents: 1200, reference: "0105-009911" }] },
    },
  });

  console.log("Datos de prueba creados.");
  console.log(`  Código de empresa: ${LOGIN_CODE}`);
  console.log(`  Gerente:  ${MANAGER_EMAIL}`);
  console.log(`  Vendedor: ${SELLER_EMAIL}`);
  console.log(`  Contraseña (ambos): ${PASSWORD}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
