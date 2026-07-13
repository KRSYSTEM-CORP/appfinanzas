import "dotenv/config";
import { PrismaClient, PaymentMethod } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const productsData = [
  { name: "Playera básica blanca", sku: "PLB-BLA", priceCents: 25000, costCents: 12000, stock: 40, lowStockThreshold: 10 },
  { name: "Playera básica negra", sku: "PLB-NEG", priceCents: 25000, costCents: 12000, stock: 35, lowStockThreshold: 10 },
  { name: "Playera estampada", sku: "PLE-001", priceCents: 32000, costCents: 16000, stock: 8, lowStockThreshold: 10 },
  { name: "Pantalón de mezclilla", sku: "PAN-MEZ", priceCents: 65000, costCents: 32000, stock: 20, lowStockThreshold: 5 },
  { name: "Pantalón deportivo", sku: "PAN-DEP", priceCents: 45000, costCents: 22000, stock: 4, lowStockThreshold: 5 },
  { name: "Sudadera con gorro", sku: "SUD-GOR", priceCents: 58000, costCents: 29000, stock: 15, lowStockThreshold: 5 },
  { name: "Chamarra ligera", sku: "CHA-LIG", priceCents: 89000, costCents: 45000, stock: 3, lowStockThreshold: 4 },
  { name: "Gorra ajustable", sku: "GOR-AJU", priceCents: 15000, costCents: 6000, stock: 50, lowStockThreshold: 10 },
  { name: "Calcetines (par)", sku: "CAL-PAR", priceCents: 6000, costCents: 2500, stock: 100, lowStockThreshold: 20 },
  { name: "Tenis casuales", sku: "TEN-CAS", priceCents: 120000, costCents: 65000, stock: 2, lowStockThreshold: 3 },
  { name: "Cinturón de piel", sku: "CIN-PIE", priceCents: 35000, costCents: 15000, stock: 12, lowStockThreshold: 5 },
  { name: "Bolsa tote", sku: "BOL-TOT", priceCents: 42000, costCents: 20000, stock: 0, lowStockThreshold: 3 },
] as const;

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(days: number, hour: number, minute: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  console.log("Limpiando datos existentes...");
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.product.deleteMany();

  console.log("Creando productos...");
  const products = await Promise.all(
    productsData.map((p) => prisma.product.create({ data: p }))
  );

  console.log("Creando ventas de ejemplo (últimos 14 días)...");
  const paymentMethods: PaymentMethod[] = ["CASH", "CARD", "OTHER"];

  for (let day = 13; day >= 0; day--) {
    const salesToday = randomInt(0, 5);
    for (let s = 0; s < salesToday; s++) {
      const numItems = randomInt(1, 3);
      const chosen = new Set<number>();
      while (chosen.size < numItems) {
        chosen.add(randomInt(0, products.length - 1));
      }

      let totalCents = 0;
      const itemsData = [...chosen].map((idx) => {
        const product = products[idx];
        const quantity = randomInt(1, 3);
        const subtotalCents = product.priceCents * quantity;
        totalCents += subtotalCents;
        return {
          productId: product.id,
          productName: product.name,
          unitPriceCents: product.priceCents,
          quantity,
          subtotalCents,
        };
      });

      await prisma.sale.create({
        data: {
          createdAt: daysAgo(day, randomInt(9, 20), randomInt(0, 59)),
          totalCents,
          paymentMethod: paymentMethods[randomInt(0, paymentMethods.length - 1)],
          items: { create: itemsData },
        },
      });
    }
  }

  console.log("Listo. Productos:", products.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
