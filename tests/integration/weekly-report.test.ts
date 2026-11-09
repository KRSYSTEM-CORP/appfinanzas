import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadContext, owner, type Ctx } from "./helpers";

let ctx: Ctx;
vi.mock("server-only", () => ({}));
const sent: { to: string; subject: string }[] = [];
vi.mock("@/lib/email", () => ({
  sendWeeklyReportEmail: async (to: string, subject: string) => {
    sent.push({ to, subject });
    return true;
  },
}));

const { sendWeeklyReports } = await import("@/lib/weekly-report");

beforeAll(async () => {
  ctx = await loadContext();
});

describe("Reporte semanal por correo", () => {
  it("solo envía a empresas que lo activaron y a sus gerentes", async () => {
    await owner.company.update({ where: { id: ctx.companyId }, data: { weeklyReportEnabled: false } });
    sent.length = 0;
    const off = await sendWeeklyReports();
    expect(sent.length).toBe(0);
    expect(off.companies).toBeGreaterThanOrEqual(0);

    await owner.company.update({ where: { id: ctx.companyId }, data: { weeklyReportEnabled: true } });
    sent.length = 0;
    const on = await sendWeeklyReports();
    expect(on.companies).toBeGreaterThanOrEqual(1);
    const managers = await owner.user.count({ where: { companyId: ctx.companyId, role: "GERENTE", status: "ACTIVE" } });
    expect(sent.length).toBeGreaterThanOrEqual(managers);

    await owner.company.update({ where: { id: ctx.companyId }, data: { weeklyReportEnabled: false } });
  });
});
