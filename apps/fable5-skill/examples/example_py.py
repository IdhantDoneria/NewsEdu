"""
Fable 5 Mode — Python Examples
"""

from wrappers.fable5 import Fable5Client, fable5


def main():
    # ── Example 1: Single call ────────────────────────────────────────────
    result = fable5(
        "Explain the difference between adaptive thinking and manual thinking in Claude.",
        effort="high",
    )
    print("=== Simple response ===")
    print(result.text)
    if result.thinking:
        print("\n=== Thinking summary ===")
        print(result.thinking)
    print(f"\nTokens — in: {result.input_tokens}, out: {result.output_tokens}, thinking: {result.thinking_tokens or 'n/a'}")

    # ── Example 2: Client with domain context ─────────────────────────────
    client = Fable5Client(
        default_effort="xhigh",
        thinking_display="summarized",
        additional_system=(
            "You are working on a Python data pipeline. "
            "Prefer pandas and favour readability over cleverness."
        ),
    )

    code = client.chat(
        "Write a function that reads a CSV, removes duplicate rows keeping "
        "the most recent by a `timestamp` column, and returns a clean DataFrame."
    )
    print("\n=== Code response ===")
    print(code.text)

    # ── Example 3: Multi-turn conversation ────────────────────────────────
    conv = client.conversation(effort="xhigh")

    t1 = conv.send("What is a generator in Python and when should I use one?")
    print("\n=== Turn 1 ===")
    print(t1.text)

    t2 = conv.send(
        "Show me a generator-based implementation of the Fibonacci sequence "
        "that supports lazy evaluation."
    )
    print("\n=== Turn 2 ===")
    print(t2.text)


if __name__ == "__main__":
    main()
