/**
 * Fable 5 Mode — TypeScript Examples
 */

import { Fable5Client, fable5 } from "../wrappers/fable5";

async function main() {
  // ── Example 1: Single call ──────────────────────────────────────────────
  const simple = await fable5("Explain adaptive thinking in Claude models.", {
    effort: "high",
  });
  console.log("=== Simple response ===");
  console.log(simple.text);
  if (simple.thinking) {
    console.log("\n=== Thinking summary ===");
    console.log(simple.thinking);
  }
  console.log(`\nTokens — input: ${simple.usage.inputTokens}, output: ${simple.usage.outputTokens}, thinking: ${simple.usage.thinkingTokens ?? "n/a"}`);

  // ── Example 2: Client with custom system ───────────────────────────────
  const client = new Fable5Client({
    defaultEffort: "xhigh",
    thinkingDisplay: "summarized",
    additionalSystemPrompt:
      "You are working on a TypeScript codebase. Prefer functional patterns.",
  });

  const codeResponse = await client.chat(
    "Write a pure function that deep-clones a JavaScript object without using JSON.parse/stringify."
  );
  console.log("\n=== Code response ===");
  console.log(codeResponse.text);

  // ── Example 3: Multi-turn conversation ────────────────────────────────
  const conv = client.createConversation({ effort: "xhigh" });

  const turn1 = await conv.send("What is a monad in functional programming?", client);
  console.log("\n=== Turn 1 ===");
  console.log(turn1.text);

  const turn2 = await conv.send(
    "Now show me a simple Maybe monad implementation in TypeScript.",
    client
  );
  console.log("\n=== Turn 2 ===");
  console.log(turn2.text);
}

main().catch(console.error);
