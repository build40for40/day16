import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

let client;

export const usage = { input: 0, cached: 0, output: 0, calls: 0 };

export async function ask({ model, system, user, schema, effort = "medium" }) {
  const response = await (client ??= new Anthropic()).beta.messages.parse({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { effort, format: zodOutputFormat(schema) },
  });
  usage.calls += 1;
  usage.input += response.usage.input_tokens;
  usage.cached += response.usage.cache_read_input_tokens ?? 0;
  usage.output += response.usage.output_tokens;
  if (response.stop_reason !== "end_turn" || !response.parsed_output) {
    throw new Error(`No usable answer (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

export async function pool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
}
