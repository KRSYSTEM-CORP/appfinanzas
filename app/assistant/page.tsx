import { ZapIcon } from "lucide-react";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { BuyCredits } from "@/components/assistant/BuyCredits";
import { getAssistantStatus, listAssistantHistory, listMyCreditRequests } from "@/lib/actions/assistant";
import { AI_APPLY_COST } from "@/lib/assistant";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const [status, history, requests] = await Promise.all([getAssistantStatus(), listAssistantHistory(), listMyCreditRequests()]);
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div>
        <p className="kr-eyebrow">Pregunta y confirma</p>
        <h1 className="kr-h1">Asistente IA</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-2 text-sm font-bold text-primary tabular-nums">
            <ZapIcon className="size-4" aria-hidden /> {status.creditsLeft} créditos
          </span>
          <a href="#recargar" className="inline-flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-sm font-bold text-primary">
            + Recargar créditos
          </a>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Pregunta por tus ventas, inventario y gastos. Consultar es gratis; si te propone un cambio (registrar un gasto o
          ajustar precios) solo se cobra si confirmas: {AI_APPLY_COST} créditos. Deshacerlo es gratis durante 24 horas.
        </p>
      </div>
      <div id="recargar" className="scroll-mt-4">
        <BuyCredits requests={requests} />
      </div>
      <AssistantChat status={status} applyCost={AI_APPLY_COST} history={history} />
    </div>
  );
}
