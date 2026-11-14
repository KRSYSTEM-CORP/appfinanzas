import "server-only";

// Proveedor del asistente. Por defecto Gemini (API pública con plan gratuito) por su
// endpoint compatible con OpenAI; si no hay AI_API_KEY pero sí ANTHROPIC_API_KEY, se
// sigue usando Claude. Cambiar de proveedor no requiere tocar el código del asistente.
//
//   AI_API_KEY    llave de Google AI Studio (https://aistudio.google.com/apikey)
//   AI_BASE_URL   opcional, por defecto el endpoint OpenAI-compatible de Gemini
//   AI_MODEL      opcional, por defecto gemini-2.5-flash
const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_MODEL = "gemini-2.5-flash";

export function aiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export type AiResult = { ok: true; text: string } | { ok: false };

export async function askModel(system: string, user: string, maxTokens = 700): Promise<AiResult> {
  const key = process.env.AI_API_KEY;
  try {
    if (key) {
      const base = (process.env.AI_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: process.env.AI_MODEL || DEFAULT_MODEL,
          // Gemini 2.5 gasta tokens «pensando»: con un tope bajo la respuesta llegaba vacía.
          max_tokens: Math.max(maxTokens, 2048),
          reasoning_effort: "none",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) {
        console.error("[asistente] proveedor respondió", res.status, (await res.text().catch(() => "")).slice(0, 300));
        return { ok: false };
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content ?? "";
      if (!text) console.error("[asistente] respuesta vacía del proveedor");
      return text ? { ok: true, text } : { ok: false };
    }
    if (process.env.ANTHROPIC_API_KEY) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) return { ok: false };
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = json.content?.find((c) => c.type === "text")?.text ?? "";
      return text ? { ok: true, text } : { ok: false };
    }
  } catch (e) {
    console.error("[asistente] error llamando al proveedor", e instanceof Error ? e.message : e);
    return { ok: false };
  }
  return { ok: false };
}
