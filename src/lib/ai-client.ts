// OpenAI-compatible chat client shared by server actions and offline scripts.
// Deliberately free of "server-only" so tsx seed/simulation scripts can reuse it.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function aiClientConfigured(): boolean {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_MODEL);
}

export async function chatJson<T>(input: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
}): Promise<{ ok: true; data: T; tokens: number; model: string } | { ok: false; error: string; model: string }> {
  if (!aiClientConfigured()) {
    return { ok: false, error: "unconfigured", model: "deterministic" };
  }
  const baseUrl = process.env.AI_BASE_URL!.replace(/\/+$/, "");
  const model = process.env.AI_MODEL!;
  const retries = input.retries ?? 2;

  let lastError = "unknown ai error";
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 4000));
    }
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {}),
        },
        body: JSON.stringify({
          model,
          temperature: input.temperature ?? 0.3,
          max_tokens: input.maxTokens ?? 2500,
          response_format: { type: "json_object" },
          messages: input.messages,
        }),
        signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
      });
      if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { total_tokens?: number };
      };
      const content = data.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) throw new Error("empty ai response");
      return {
        ok: true,
        data: JSON.parse(content) as T,
        tokens: data.usage?.total_tokens ?? 0,
        model,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown ai error";
      // Only transient failures are retried; JSON/parse errors are final.
      if (!/HTTP (4|5)/.test(lastError) && !/empty ai response/.test(lastError)) break;
    }
  }
  return { ok: false, error: lastError, model: model };
}

export function faDigits(value: number): string {
  return value.toLocaleString("fa-IR");
}
