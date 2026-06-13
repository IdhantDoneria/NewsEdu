/**
 * Fable 5 Wrapper for Claude Opus 4.8
 *
 * Applies Fable 5's distinctive thinking patterns to Opus 4.8:
 * - Adaptive thinking at max/xhigh effort (always thinks)
 * - Self-verification system prompt
 * - Long-horizon autonomy behaviours
 * - Outcome-first communication
 * - Scope discipline
 *
 * Usage:
 *   import { Fable5Client } from "./fable5";
 *   const f5 = new Fable5Client({ apiKey: process.env.ANTHROPIC_API_KEY });
 *   const result = await f5.chat("Refactor this codebase module to use dependency injection", { effort: "xhigh" });
 */

import Anthropic from "@anthropic-ai/sdk";

export type Fable5Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type ThinkingDisplay = "summarized" | "omitted";

export interface Fable5Options {
  apiKey?: string;
  /** Override the base system prompt additions */
  additionalSystemPrompt?: string;
  /** Default effort level for all calls. Default: "xhigh" */
  defaultEffort?: Fable5Effort;
  /** Default max_tokens. Default: 32000 */
  defaultMaxTokens?: number;
  /** Show thinking summaries in responses. Default: "summarized" */
  thinkingDisplay?: ThinkingDisplay;
}

export interface Fable5ChatOptions {
  /** Effort level for this specific call */
  effort?: Fable5Effort;
  /** max_tokens override */
  maxTokens?: number;
  /** Extra system prompt to append */
  systemAppend?: string;
  /** Conversation history for multi-turn chats */
  history?: Anthropic.MessageParam[];
  /** Whether to stream (default: false) */
  stream?: boolean;
}

export interface Fable5Response {
  text: string;
  thinking?: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens?: number;
  };
}

const FABLE5_SYSTEM_PROMPT = `You are operating in Fable 5 mode — a high-autonomy, high-verification cognitive configuration that replicates Claude Fable 5's thinking patterns on Claude Opus 4.8.

## Thinking

Extended thinking is active. Before responding to any complex or multi-step request, think carefully. Reason through alternatives, validate intermediate conclusions, and check your work before surfacing it.

## Self-Verification Protocol

Before reporting progress, audit every claim against a tool result or established fact from this session:
1. What did I intend to do?
2. What did the result actually show?
3. Do they match? If not, which should I trust?

Report outcomes faithfully: if tests fail, say so with the output; if a step was skipped, say that. When something is done and verified, state it plainly without hedging.

## Long-Horizon Autonomy

On long tasks: maintain a mental scratchpad of what you've done, confirmed, and still need to verify. At natural checkpoints, re-read completed work critically. Continue without stopping to ask for permission on reversible actions that follow logically from the original request. Pause only for: destructive/irreversible actions, genuine scope changes, or input only the user can provide.

## Action Bias

When you have enough information to act, act. Do not re-derive established facts, re-litigate settled decisions, or narrate options you will not pursue. If ending a turn with a plan or next-step list, do that work now instead.

## Scope Discipline

Do not add features, refactor, or abstract beyond what the task requires. Do the simplest thing that works well.

## Communication

Lead user-facing messages with the outcome (one sentence on what happened or what you found). Then supporting detail — only what changes what the reader does next. Write complete sentences. No arrow chains. No coined shorthand without re-introduction.

## Error Recovery

On encountering an error: diagnose from available evidence, apply a fix if within scope, verify the fix. Only ask the user when genuinely blocked.`;

export class Fable5Client {
  private client: Anthropic;
  private options: Required<Fable5Options>;

  constructor(options: Fable5Options = {}) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.options = {
      apiKey: options.apiKey ?? "",
      additionalSystemPrompt: options.additionalSystemPrompt ?? "",
      defaultEffort: options.defaultEffort ?? "xhigh",
      defaultMaxTokens: options.defaultMaxTokens ?? 32000,
      thinkingDisplay: options.thinkingDisplay ?? "summarized",
    };
  }

  private buildSystemPrompt(append?: string): string {
    const parts = [FABLE5_SYSTEM_PROMPT];
    if (this.options.additionalSystemPrompt) {
      parts.push(this.options.additionalSystemPrompt);
    }
    if (append) {
      parts.push(append);
    }
    return parts.join("\n\n");
  }

  async chat(
    message: string,
    options: Fable5ChatOptions = {}
  ): Promise<Fable5Response> {
    const effort = options.effort ?? this.options.defaultEffort;
    const maxTokens = options.maxTokens ?? this.options.defaultMaxTokens;
    const history = options.history ?? [];

    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: "user", content: message },
    ];

    const response = await this.client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: maxTokens,
      thinking: {
        type: "adaptive",
        // @ts-expect-error — display field is valid per Anthropic API
        display: this.options.thinkingDisplay,
      },
      // @ts-expect-error — output_config is valid per Anthropic API
      output_config: { effort },
      system: this.buildSystemPrompt(options.systemAppend),
      messages,
    });

    let text = "";
    let thinking = "";

    for (const block of response.content) {
      if (block.type === "thinking") {
        thinking = (block as Anthropic.ThinkingBlock).thinking ?? "";
      } else if (block.type === "text") {
        text = (block as Anthropic.TextBlock).text;
      }
    }

    const thinkingTokens =
      (response.usage as { output_tokens_details?: { thinking_tokens?: number } })
        .output_tokens_details?.thinking_tokens;

    return {
      text,
      thinking: thinking || undefined,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        thinkingTokens,
      },
    };
  }

  /**
   * Multi-turn conversation helper.
   * Keeps history automatically so you can call chat() in a loop.
   */
  createConversation(options: Omit<Fable5ChatOptions, "history"> = {}) {
    const history: Anthropic.MessageParam[] = [];

    return {
      async send(message: string, client: Fable5Client): Promise<Fable5Response> {
        const response = await client.chat(message, { ...options, history });
        history.push({ role: "user", content: message });
        history.push({ role: "assistant", content: response.text });
        return response;
      },
      history,
    };
  }

  /** Get the full Fable 5 system prompt used by this client */
  getSystemPrompt(): string {
    return this.buildSystemPrompt();
  }
}

/** Convenience: single-call Fable 5 chat with defaults */
export async function fable5(
  message: string,
  options: Fable5Options & Fable5ChatOptions = {}
): Promise<Fable5Response> {
  const client = new Fable5Client(options);
  return client.chat(message, options);
}
