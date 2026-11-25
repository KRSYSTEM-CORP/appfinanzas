import { requireManagerPermission } from "@/lib/session";
import { AssistantCreditsProvider, CreditsBadge } from "@/components/assistant/AssistantCredits";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { getBranding, getFiscalData } from "@/lib/actions/settings";
import { PageHeader } from "@/components/shared/PageHeader";
import { RechargeButton } from "@/components/assistant/RechargeButton";
import { AssistantTabs } from "@/components/assistant/AssistantTabs";
import { BuyCredits } from "@/components/assistant/BuyCredits";
import { getAssistantStatus, listAssistantHistory, listMyCreditRequests } from "@/lib/actions/assistant";

export const dynamic = "force-dynamic";
// Las consultas al modelo (acciones del servidor de esta página) pueden tardar; 60 s de tope.
export const maxDuration = 60;

export default async function AssistantPage() {
  const session = await requireManagerPermission("assistant");
  const [status, history, requests, { logoDataUrl }, fiscalData] = await Promise.all([getAssistantStatus(), listAssistantHistory(), listMyCreditRequests(), getBranding(), getFiscalData()]);
  const company = { name: session.companyName, logoDataUrl, ...fiscalData };
  return (
    <AssistantCreditsProvider initial={status.creditsLeft}>
    <div className="flex flex-col gap-4 px-4 py-5">
      <PageHeader eyebrow={session.companyName} title="Asistente IA">
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CreditsBadge />
          <RechargeButton />
        </div>
      </PageHeader>
      <AssistantTabs
        history={history}
        credits={
          <div id="recargar" className="scroll-mt-4">
            <BuyCredits requests={requests} />
          </div>
        }
        chat={<AssistantChat status={status} history={history} company={company} />}
      />
    </div>
    </AssistantCreditsProvider>
  );
}
