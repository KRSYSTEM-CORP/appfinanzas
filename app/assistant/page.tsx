import { AssistantChat } from "@/components/assistant/AssistantChat";
import { BuyCredits } from "@/components/assistant/BuyCredits";
import { getAssistantStatus, listAssistantHistory, listMyCreditRequests } from "@/lib/actions/assistant";
import { AI_APPLY_COST } from "@/lib/assistant";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const [status, history, requests] = await Promise.all([getAssistantStatus(), listAssistantHistory(), listMyCreditRequests()]);
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Pregunta y confirma</p>
        <h1 className="text-3xl font-bold tracking-tight">Asistente IA</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pregunta por tus ventas, inventario y gastos. Consultar es gratis; si te propone un cambio (registrar un gasto o
          ajustar precios) solo se cobra si confirmas: {AI_APPLY_COST} créditos.
        </p>
      </div>
      <BuyCredits requests={requests} />
      <AssistantChat status={status} applyCost={AI_APPLY_COST} history={history} />
    </div>
  );
}
