import { AssistantChat } from "@/components/assistant/AssistantChat";
import { getAssistantStatus } from "@/lib/actions/assistant";
import { AI_APPLY_COST } from "@/lib/assistant";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const status = await getAssistantStatus();
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Asistente IA</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pregunta por tus ventas, inventario y gastos. Consultar es gratis; si te propone un cambio (registrar un gasto o
          ajustar precios) solo se cobra si confirmas: {AI_APPLY_COST} créditos.
        </p>
      </div>
      <AssistantChat status={status} applyCost={AI_APPLY_COST} />
    </div>
  );
}
