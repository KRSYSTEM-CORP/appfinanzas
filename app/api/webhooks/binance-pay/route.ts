import { NextResponse, type NextRequest } from "next/server";
import { verifyBinancePayWebhookSignature } from "@/lib/binance-pay";
import { withSuperAdmin } from "@/lib/tenant-db";
import { PLATFORM_SETTINGS_ID, monthsCoveredWithBonus, extendDueDateByMonths } from "@/lib/billing";

// Binance calls this after a checkout order (see
// createBinancePayCheckout in lib/actions/billing.ts) is actually paid —
// this is the ONLY step that marks a BinancePayOrder PAID and advances
// Company.nextPaymentDueDate; nothing here waits on a platform admin.
// Register this URL (https://<domain>/api/webhooks/binance-pay) in the
// Binance Merchant dashboard once BINANCE_PAY_API_KEY/SECRET_KEY are set.
const OK = { returnCode: "SUCCESS", returnMessage: null };
const FAIL = { returnCode: "FAIL", returnMessage: "signature verification failed" };

type BinancePayCallback = {
  bizType: string;
  bizStatus: string;
  data: string;
};

type BinancePayOrderData = {
  merchantTradeNo: string;
  transactTime?: number;
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("BinancePay-Timestamp");
  const nonce = request.headers.get("BinancePay-Nonce");
  const signature = request.headers.get("BinancePay-Signature");

  if (!timestamp || !nonce || !signature) {
    return NextResponse.json(FAIL, { status: 400 });
  }
  if (!verifyBinancePayWebhookSignature(timestamp, nonce, rawBody, signature)) {
    return NextResponse.json(FAIL, { status: 400 });
  }

  const callback = JSON.parse(rawBody) as BinancePayCallback;
  if (callback.bizType !== "PAY" || callback.bizStatus !== "PAY_SUCCESS") {
    // Any other status (e.g. a cancel/refund notification) is acknowledged
    // without action — only a successful payment ever changes billing state.
    return NextResponse.json(OK);
  }

  const orderData = JSON.parse(callback.data) as BinancePayOrderData;

  await withSuperAdmin(async (tx) => {
    const order = await tx.binancePayOrder.findUnique({
      where: { merchantTradeNo: orderData.merchantTradeNo },
    });
    // Already processed (Binance retries webhooks) or an order we don't
    // recognize — either way, acknowledging without touching billing again
    // is the correct, idempotent response.
    if (!order || order.status === "PAID") return;

    const settings = await tx.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
    const company = await tx.company.findUnique({ where: { id: order.companyId } });
    if (!settings?.billingExchangeRate || !company) return;

    // order.amountUsdCents already reflects whatever plan (monthly or
    // annual) the checkout was created for — see createBinancePayCheckout
    // in lib/actions/billing.ts — so the months this order actually covers,
    // annual-prepay bonus included, is derived from the amount itself
    // rather than assumed to always be exactly one month.
    const months = company.monthlyFeeUsdCents
      ? monthsCoveredWithBonus(order.amountUsdCents, company.monthlyFeeUsdCents)
      : 1;
    const periodEnd = extendDueDateByMonths(company.nextPaymentDueDate, months || 1);

    await tx.payment.create({
      data: {
        companyId: order.companyId,
        amountUsdCents: order.amountUsdCents,
        exchangeRate: settings.billingExchangeRate,
        periodEnd,
        note: "Pago automático vía Binance Pay",
        verifiedById: "system:binance-pay-webhook",
      },
    });
    await tx.company.update({ where: { id: order.companyId }, data: { nextPaymentDueDate: periodEnd } });
    await tx.binancePayOrder.update({
      where: { id: order.id },
      data: { status: "PAID", paidAt: new Date() },
    });
  });

  return NextResponse.json(OK);
}
