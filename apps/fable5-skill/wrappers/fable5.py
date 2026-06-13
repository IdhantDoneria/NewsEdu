"""
Fable 5 Wrapper for Claude Opus 4.8 (Python)

Applies Fable 5's distinctive thinking patterns to Opus 4.8:
- Adaptive thinking at max/xhigh effort (always thinks)
- Self-verification system prompt
- Long-horizon autonomy behaviours
- Outcome-first communication
- Scope discipline

Usage:
    from fable5 import Fable5Client

    client = Fable5Client(api_key="your-key")
    result = await client.chat(
        "Refactor this module to use dependency injection",
        effort="xhigh"
    )
    print(result["text"])
    print(result["thinking"])  # Summarized thinking block
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Literal, Optional

import anthropic

Effort = Literal["low", "medium", "high", "xhigh", "max"]
ThinkingDisplay = Literal["summarized", "omitted"]

FABLE5_SYSTEM_PROMPT = """\
You are operating in Fable 5 mode — a high-autonomy, high-verification cognitive
configuration that replicates Claude Fable 5's thinking patterns on Claude Opus 4.8.

## Thinking

Extended thinking is active. Before responding to any complex or multi-step request,
think carefully. Reason through alternatives, validate intermediate conclusions, and
check your work before surfacing it.

## Self-Verification Protocol

Before reporting progress, audit every claim against a tool result or established fact
from this session:
1. What did I intend to do?
2. What did the result actually show?
3. Do they match? If not, which should I trust?

Report outcomes faithfully: if tests fail, say so with the output; if a step was
skipped, say that. When something is done and verified, state it plainly without hedging.

## Long-Horizon Autonomy

On long tasks: maintain a mental scratchpad of what you've done, confirmed, and still
need to verify. At natural checkpoints, re-read completed work critically. Continue
without stopping to ask permission on reversible actions that follow logically from
the original request. Pause only for: destructive/irreversible actions, genuine scope
changes, or input only the user can provide.

## Action Bias

When you have enough information to act, act. Do not re-derive established facts,
re-litigate settled decisions, or narrate options you will not pursue. If ending a
turn with a plan or next-step list, do that work now instead.

## Scope Discipline

Do not add features, refactor, or abstract beyond what the task requires. Do the
simplest thing that works well.

## Communication

Lead user-facing messages with the outcome (one sentence on what happened or what you
found). Then supporting detail — only what changes what the reader does next. Write
complete sentences. No arrow chains. No coined shorthand without re-introduction.

## Error Recovery

On encountering an error: diagnose from available evidence, apply a fix if within scope,
verify the fix. Only ask the user when genuinely blocked.\
"""


@dataclass
class Fable5Response:
    text: str
    thinking: Optional[str]
    model: str
    input_tokens: int
    output_tokens: int
    thinking_tokens: Optional[int]


@dataclass
class Fable5Client:
    api_key: Optional[str] = None
    default_effort: Effort = "xhigh"
    default_max_tokens: int = 32_000
    thinking_display: ThinkingDisplay = "summarized"
    additional_system: str = ""

    def __post_init__(self) -> None:
        self._client = anthropic.Anthropic(
            api_key=self.api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        )

    def _system_prompt(self, append: str = "") -> str:
        parts = [FABLE5_SYSTEM_PROMPT]
        if self.additional_system:
            parts.append(self.additional_system)
        if append:
            parts.append(append)
        return "\n\n".join(parts)

    def chat(
        self,
        message: str,
        *,
        effort: Optional[Effort] = None,
        max_tokens: Optional[int] = None,
        system_append: str = "",
        history: Optional[list] = None,
    ) -> Fable5Response:
        """Send a message and return the Fable 5 response."""
        messages = list(history or []) + [{"role": "user", "content": message}]

        response = self._client.messages.create(
            model="claude-opus-4-8",
            max_tokens=max_tokens or self.default_max_tokens,
            thinking={"type": "adaptive", "display": self.thinking_display},
            output_config={"effort": effort or self.default_effort},
            system=self._system_prompt(system_append),
            messages=messages,
        )

        text = ""
        thinking = None
        for block in response.content:
            if block.type == "thinking":
                thinking = getattr(block, "thinking", None)
            elif block.type == "text":
                text = block.text

        thinking_tokens = None
        if hasattr(response.usage, "output_tokens_details"):
            details = response.usage.output_tokens_details
            thinking_tokens = getattr(details, "thinking_tokens", None)

        return Fable5Response(
            text=text,
            thinking=thinking,
            model=response.model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            thinking_tokens=thinking_tokens,
        )

    def conversation(self, effort: Optional[Effort] = None):
        """Return a stateful conversation helper."""
        return _Conversation(client=self, effort=effort)


@dataclass
class _Conversation:
    client: Fable5Client
    effort: Optional[Effort] = None
    history: list = field(default_factory=list)

    def send(self, message: str) -> Fable5Response:
        response = self.client.chat(message, effort=self.effort, history=self.history)
        self.history.append({"role": "user", "content": message})
        self.history.append({"role": "assistant", "content": response.text})
        return response


def fable5(
    message: str,
    *,
    api_key: Optional[str] = None,
    effort: Effort = "xhigh",
    max_tokens: int = 32_000,
    thinking_display: ThinkingDisplay = "summarized",
) -> Fable5Response:
    """Convenience single-call wrapper."""
    client = Fable5Client(
        api_key=api_key,
        default_effort=effort,
        default_max_tokens=max_tokens,
        thinking_display=thinking_display,
    )
    return client.chat(message)
