# Fable 5 Skill for Claude Opus 4.8

Bring Fable 5's thinking patterns to Claude Opus 4.8 — a Claude Code skill
and API wrapper set built from Anthropic's official Fable 5 prompting guide.

## What is Fable 5?

Claude Fable 5 (released June 9, 2026) is Anthropic's most capable widely-released
model. Its standout characteristics over Opus 4.8:

- **Adaptive thinking is always on** — it always thinks before responding; you cannot disable it
- **Self-verification** — at the highest effort, it reflects on and validates its own work
- **File-based memory** — improves 3x more than Opus 4.8 on complex tasks when it can keep notes
- **Long-horizon autonomy** — sustains productive output over multi-hour autonomous runs
- **First-shot correctness** — single-pass implementations of systems that previously took days
- **Outcome-first communication** — leads with what happened, not what it plans to do
- **Parallel subagent dispatch** — delegates independent work concurrently

This skill replicates all of these behaviours on Opus 4.8 via:
1. The right API parameters (`adaptive` thinking + `xhigh`/`max` effort)
2. A carefully crafted system prompt that instills each behaviour pattern
3. A Claude Code `/fable5` slash command that activates the mode interactively

## Installation

### Claude Code skill (interactive use)

```bash
bash install.sh           # installs to current project's .claude/skills/
bash install.sh --global  # installs to ~/.claude/skills/ (all projects)
```

Then in any Claude Code session:

```
/fable5
```

This activates Fable 5 mode for the rest of the session. Claude will confirm activation
and initialise the memory system.

### API wrapper (TypeScript)

```typescript
import { Fable5Client, fable5 } from "./wrappers/fable5";

// Single call
const result = await fable5("Audit this codebase for security issues.", {
  effort: "max",
});

// Client with custom context
const client = new Fable5Client({
  defaultEffort: "xhigh",
  additionalSystemPrompt: "You are working on a React + TypeScript codebase.",
});

const response = await client.chat("Refactor the auth module to use custom hooks.");
console.log(response.text);
console.log(response.thinking); // summarised thinking block

// Multi-turn conversation
const conv = client.createConversation({ effort: "xhigh" });
const t1 = await conv.send("What pattern would you use for global state here?", client);
const t2 = await conv.send("Implement it.", client);
```

### API wrapper (Python)

```python
from wrappers.fable5 import Fable5Client, fable5

# Single call
result = fable5("Audit this codebase for security issues.", effort="max")
print(result.text)
print(result.thinking)

# Client with context
client = Fable5Client(
    default_effort="xhigh",
    additional_system="You are working on a Python Django codebase.",
)

r = client.chat("Write a middleware that logs slow requests over 500ms.")
print(r.text)

# Multi-turn
conv = client.conversation(effort="xhigh")
conv.send("What pattern should I use for async task queuing here?")
conv.send("Implement it with Celery.")
```

## API configuration reference

The key API parameters that give Opus 4.8 Fable 5's thinking depth:

```python
response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=32000,
    thinking={
        "type": "adaptive",     # Fable 5 uses adaptive-only thinking
        "display": "summarized" # See the thinking summary; omit for speed
    },
    output_config={
        "effort": "xhigh"       # "max" for hardest tasks; "high" for routine
    },
    system=FABLE5_SYSTEM_PROMPT,
    messages=[{"role": "user", "content": "..."}]
)
```

### Effort levels

| Level | When to use |
|-------|------------|
| `max` | Hardest, most open-ended tasks — no ceiling on thinking depth |
| `xhigh` | Complex coding, research, multi-step builds (recommended default) |
| `high` | General use (Fable 5's default; same as Opus 4.8 default thinking depth) |
| `medium` | Routine work with occasional complex questions |
| `low` | Speed-critical, simple queries |

## What changes vs raw Opus 4.8

| Behaviour | Raw Opus 4.8 | Fable 5 Mode |
|-----------|-------------|--------------|
| Thinking | Off by default | Always on (adaptive, xhigh effort) |
| Verification | Reports intent | Audits every claim against evidence |
| Long runs | May drift or stall | Scratchpad + self-corrects |
| Scope | May over-engineer | Constrained to task |
| Communication | Verbose | Outcome-first |
| Action bias | May over-ask | Acts unless genuinely blocked |
| Parallelism | Sequential | Concurrent where independent |

## Limitations

Fable 5 mode on Opus 4.8 is an approximation. Things that cannot be replicated:

- **Raw model capability**: Fable 5 is genuinely a more capable model than Opus 4.8.
  The system prompt captures its *patterns* but not its underlying intelligence.
- **Context window**: Fable 5 has a 1M-token context window. Opus 4.8 has 200K.
- **Vision quality**: Fable 5's vision is substantially better than Opus 4.8's.
- **Native adaptive thinking**: On Fable 5, adaptive thinking is a first-class training
  feature. On Opus 4.8, it's a prompted behaviour.

## Files

```
fable5-skill/
├── README.md                         This file
├── install.sh                        Claude Code skill installer
├── package.json                      npm metadata
├── prompts/
│   └── fable5-system-prompt.md       Full annotated system prompt + API config guide
├── wrappers/
│   ├── fable5.ts                     TypeScript client
│   └── fable5.py                     Python client
└── examples/
    ├── example_ts.ts                 TypeScript usage examples
    └── example_py.py                 Python usage examples
```

The Claude Code skill itself lives at: `.claude/skills/fable5.md`
