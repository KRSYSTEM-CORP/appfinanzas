import { requirePermission } from "@/lib/session";
import { ZapIcon } from "lucide-react";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { PageHeader } from "@/components/shared/PageHeader";
import { RechargeButton } from "@/components/assistant/RechargeButton";
import { AssistantTabs } from "@/components/assistant/AssistantTabs";
import { BuyCredits } from "@/components/assistant/BuyCredits";
import { getAssistantStatus, listAssistantHistory, listMyCreditRequests } from "@/lib/actions/assistant";
import { AI_APPLY_COST } from "@/lib/assistant";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const session = await requirePermission("assistant");
  const [status, history, requests] = await Promise.all([getAssistantStatus(), listAssistantHistory(), listMyCreditRequests()]);
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <PageHeader eyebrow={session.companyName} title="Asistente IA">
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-3.5 py-2 text-sm text-primary" title="Créditos disponibles">
            <ZapIcon className="size-4" aria-hidden /> <b className="tabular-nums">{status.creditsLeft}</b> créditos
          </span>
          <RechargeButton />
        </div>
      </PageHeader>
      <AssistantTabs
        history={history}
        credits={
          <div id="recargar" className="scroll-mt-4">
            <BuyCredits requests={requests} creditsLeft={status.creditsLeft} applyCost={AI_APPLY_COST} />
          </div>
        }
        chat={<AssistantChat status={status} applyCost={AI_APPLY_COST} history={history} />}
      />
    </div>
  );
}
