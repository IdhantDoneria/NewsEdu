import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

/**
 * Writes the plain-language opening of the paid report.
 *
 * Boundary: the LLM NEVER decides eligibility. The deterministic engine has
 * already computed the matches; the model receives them as fixed facts and is
 * instructed not to add, remove, or re-judge schemes. Without an
 * ANTHROPIC_API_KEY the client falls back to a deterministic template.
 */

interface NarrateBody {
  profile: string;
  matchCount: number;
  totalMaxValue: string;
  schemes: Array<{ name: string; benefit: string }>;
  nearMisses: Array<{ name: string; fix: string }>;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ narration: null, source: "template" });
  }

  const body = (await req.json()) as NarrateBody;
  if (!body || typeof body.matchCount !== "number" || !Array.isArray(body.schemes)) {
    return NextResponse.json({ narration: null, source: "template" }, { status: 400 });
  }

  const client = new Anthropic();

  const schemeList = body.schemes
    .slice(0, 30)
    .map((s) => `- ${s.name}: ${s.benefit}`)
    .join("\n");
  const nearMissList = body.nearMisses
    .slice(0, 10)
    .map((n) => `- ${n.name} (blocked only by: ${n.fix})`)
    .join("\n");

  try {
    const response = await client.messages.create({
      model: process.env.NARRATION_MODEL || "claude-opus-4-8",
      max_tokens: 1024,
      system:
        "You write the opening summary of a paid eligibility report for an Indian MSME owner. " +
        "The eligibility verdicts were computed by a deterministic rule engine and are FINAL — " +
        "you must not add schemes, remove schemes, question the verdicts, or invent benefit " +
        "amounts, percentages, or conditions not present in the input. Your job is purely to " +
        "narrate the given results warmly and clearly in 2 short paragraphs (no headings, no " +
        "lists, no markdown). Mention the match count, the standout opportunities by name, and " +
        "what the owner should realistically do first. Use Indian rupee conventions (lakh, " +
        "crore). Plain English a busy business owner reads in 30 seconds.",
      messages: [
        {
          role: "user",
          content:
            `Business profile: ${String(body.profile).slice(0, 600)}\n\n` +
            `Engine verdict: eligible for ${body.matchCount} schemes, combined benefit ceiling ${body.totalMaxValue}.\n\n` +
            `Matched schemes:\n${schemeList}\n\n` +
            (nearMissList ? `Near-misses (one fix away):\n${nearMissList}\n\n` : "") +
            "Write the report opening now.",
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return NextResponse.json({ narration: text || null, source: "claude" });
  } catch {
    // Never block the paid report on the narration call.
    return NextResponse.json({ narration: null, source: "template" });
  }
}
