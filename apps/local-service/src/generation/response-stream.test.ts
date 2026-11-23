import { expect, it } from "vitest";
import { readPlanStream } from "./response-stream.js";
it("decodes split UTF-8 and CRLF events and retains only numeric usage", async () => {
  const wire = new TextEncoder().encode(
    "data: " +
      JSON.stringify({
        type: "response.output_text.delta",
        delta: '{"title":"Rivière"}',
      }) +
      "\r\n\r\ndata: " +
      JSON.stringify({
        type: "response.completed",
        response: {
          usage: {
            input_tokens: 12,
            output_tokens: 4,
            total_tokens: 16,
            secret: "never save",
          },
        },
      }) +
      "\r\n\r\n",
  );
  let index = 0;
  const response = new Response(
    new ReadableStream({
      pull(c) {
        if (index === wire.length) c.close();
        else c.enqueue(wire.slice(index, (index += 1)));
      },
    }),
  );
  expect(await readPlanStream(response, new AbortController().signal)).toEqual({
    text: '{"title":"Rivière"}',
    usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
  });
});
it("cancels a stalled stream without accepting a partial plan", async () => {
  let cancelled = false;
  const controller = new AbortController();
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(
          new TextEncoder().encode(
            'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
          ),
        );
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  const result = readPlanStream(response, controller.signal);
  controller.abort(new Error("cancelled by author"));
  await expect(result).rejects.toThrow("cancelled by author");
  expect(cancelled).toBe(true);
});

it("preserves cancellation without leaking a rejected stream cleanup promise", async () => {
  const controller = new AbortController();
  const reason = new DOMException("Timed out", "TimeoutError");
  const stream = new ReadableStream<Uint8Array>({
    cancel: () => Promise.reject(reason),
  });
  const result = readPlanStream(new Response(stream), controller.signal);
  controller.abort(reason);
  await expect(result).rejects.toBe(reason);
  // Give any fire-and-forget cancellation rejection an opportunity to surface.
  await new Promise((resolve) => setTimeout(resolve, 10));
});
