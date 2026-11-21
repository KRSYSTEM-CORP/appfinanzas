import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import pg from "pg";
const TOKEN = process.env.ADMIN_API_TOKEN || "";
if (TOKEN.length < 32) { console.error("ADMIN_API_TOKEN muy corto"); process.exit(1); }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000, statement_timeout: 8000 });
const ok = (a) => { const x = Buffer.from(a || ""), y = Buffer.from("Bearer " + TOKEN); return x.length === y.length && timingSafeEqual(x, y); };
const Q = {
  companies: `SELECT id, name, "createdAt", "isExempt", "monthlyFeeUsdCents", "nextPaymentDueDate" FROM "Company" ORDER BY "createdAt" DESC`,
  paid: `SELECT "companyId" AS owner, count(*)::int AS n, coalesce(sum("amountUsdCents"),0)::int AS total, max("createdAt") AS last FROM "Payment" GROUP BY "companyId"`,
  users: `SELECT "companyId" AS owner, count(*)::int AS n FROM "User" GROUP BY "companyId"`,
  recent: `SELECT "companyId" AS owner, "amountUsdCents", "createdAt" FROM "Payment" ORDER BY "createdAt" DESC LIMIT 15`,
  pending: `SELECT count(*)::int AS n FROM "PaymentReport" WHERE status = 'PENDING'`,
  month: `SELECT coalesce(sum("amountUsdCents"),0)::int AS total FROM "Payment" WHERE "createdAt" >= date_trunc('month', now())`,
};
http.createServer(async (req, res) => {
  const send = (c, o) => { res.writeHead(c, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(o)); };
  if (req.url === "/health") return send(200, { ok: true });
  if (req.method !== "GET" || req.url !== "/pos") return send(404, { error: "no" });
  if (!ok(req.headers.authorization)) return send(401, { error: "no autorizado" });
  try {
    const out = {};
    for (const [k, q] of Object.entries(Q)) out[k] = (await pool.query(q)).rows;
    send(200, out);
  } catch (e) { console.error("consulta fallo", e.message); send(500, { error: "error" }); }
}).listen(8080, "0.0.0.0", () => console.log("admin-api lista"));
