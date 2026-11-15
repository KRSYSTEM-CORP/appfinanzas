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

export type AiResult = { ok: true; text: string } | { ok: false; reason: string };

type ChatJson = { choices?: { message?: { content?: string | null } }[]; error?: { message?: string } };

// Un intento contra el endpoint OpenAI-compatible. Devuelve el texto o el motivo del fallo.
async function callCompatible(
  base: string,
  key: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  withReasoning: boolean
): Promise<{ text: string } | { status: number; detail: string }> {
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      // Gemini 2.5 gasta tokens «pensando»: con un tope bajo la respuesta llegaba vacía.
      max_tokens: Math.max(maxTokens, 2048),
      ...(withReasoning ? { reasoning_effort: "none" } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const raw = await res.text().catch(() => "");
  if (!res.ok) return { status: res.status, detail: raw.slice(0, 300) };
  let json: ChatJson = {};
  try {
    json = JSON.parse(raw) as ChatJson;
  } catch {
    return { status: 502, detail: "respuesta no válida del proveedor" };
  }
  const text = json.choices?.[0]?.message?.content ?? "";
  return text ? { text } : { status: 204, detail: "respuesta vacía" };
}

export async function askModel(system: string, user: string, maxTokens = 700): Promise<AiResult> {
  const key = process.env.AI_API_KEY;
  try {
    if (key) {
      const base = (process.env.AI_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
      const configured = process.env.AI_MODEL || DEFAULT_MODEL;
      // El modelo configurado primero; si el proveedor lo rechaza (retirado, sin cupo),
      // se prueba el alias «latest» de Gemini antes de rendirse.
      const models = [...new Set([configured, "gemini-flash-latest"])];
      let last = "sin intentos";
      for (const model of models) {
        // Con y sin `reasoning_effort`: algunos modelos lo rechazan con 400.
        for (const withReasoning of [true, false]) {
          const r = await callCompatible(base, key, model, system, user, maxTokens, withReasoning);
          if ("text" in r) return { ok: true, text: r.text };
          last = `${model} → ${r.status} ${r.detail}`;
          console.error("[asistente] intento fallido", last);
          // Llave inválida o sin permiso: no sirve reintentar con otras variantes.
          if (r.status === 401 || r.status === 403) return { ok: false, reason: `auth:${r.status}` };
          if (r.status === 429) return { ok: false, reason: "cuota:429" };
          if (r.status !== 400 && r.status !== 404 && r.status !== 204) break;
        }
      }
      return { ok: false, reason: last };
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
      if (!res.ok) {
        console.error("[asistente] Anthropic respondió", res.status);
        return { ok: false, reason: `anthropic:${res.status}` };
      }
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = json.content?.find((c) => c.type === "text")?.text ?? "";
      return text ? { ok: true, text } : { ok: false, reason: "vacía" };
    }
  } catch (e) {
    console.error("[asistente] error llamando al proveedor", e instanceof Error ? e.message : e);
    return { ok: false, reason: e instanceof Error ? e.message : "error" };
  }
  return { ok: false, reason: "sin proveedor" };
}
