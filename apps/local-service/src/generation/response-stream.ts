/** Consume bounded SSE across arbitrary UTF-8/network boundaries; never accept a partial plan. */
export async function readPlanStream(
  response: Response,
  signal: AbortSignal,
): Promise<{ text: string; usage: Record<string, unknown> }> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ChatGPT returned an empty stream.");
  const decoder = new TextDecoder();
  let pending = "",
    text = "",
    size = 0,
    completed = false,
    usage: Record<string, unknown> = {};
  const consume = (block: string) => {
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    let event: Record<string, any>;
    try {
      event = JSON.parse(data);
    } catch {
      throw new Error("ChatGPT returned an unreadable stream.");
    }
    if (event.type === "response.failed" || event.type === "error")
      throw new Error(
        providerError(
          event.response?.error?.code ?? event.error?.code ?? event.code,
        ),
      );
    if (event.type === "response.incomplete")
      throw new Error(
        "ChatGPT returned an incomplete story. Try a shorter brief.",
      );
    if (event.type === "response.output_text.delta") {
      if (typeof event.delta !== "string" || completed)
        throw new Error("ChatGPT returned an invalid stream.");
      text += event.delta;
    }
    if (event.type === "response.completed") {
      if (completed)
        throw new Error("ChatGPT returned duplicate completion events.");
      completed = true;
      if (event.response?.usage && typeof event.response.usage === "object") {
        // Never persist arbitrary provider output in job metadata.
        for (const key of ["input_tokens", "output_tokens", "total_tokens"])
          if (Number.isFinite(event.response.usage[key]))
            usage[key] = event.response.usage[key];
      }
    }
  };
  const abort = () => {
    void reader.cancel();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.length;
      if (size > 4 * 1024 * 1024)
        throw new Error("ChatGPT story exceeded the response size limit.");
      pending += decoder.decode(value, { stream: true });
      pending = pending.replaceAll("\r\n", "\n");
      let boundary;
      while ((boundary = pending.indexOf("\n\n")) >= 0) {
        consume(pending.slice(0, boundary));
        pending = pending.slice(boundary + 2);
      }
    }
    pending += decoder.decode();
    if (pending.trim()) consume(pending);
    if (!completed || !text.trim())
      throw new Error(
        "ChatGPT generation was interrupted or empty. Please retry.",
      );
    return { text, usage };
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel();
  }
}
export function providerError(code: unknown): string {
  if (code === "subscription_sharing_usage_limit_exceeded")
    return "Your ChatGPT usage limit has been reached. Open Manage usage in ChatGPT before retrying.";
  if (code === "subscription_sharing_usage_unavailable")
    return "ChatGPT plan usage is unavailable for this account. Open Manage usage or reconnect.";
  return "ChatGPT could not complete this request. Please retry or reconnect.";
}
