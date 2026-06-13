#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Fable 5 Skill Installer for Claude Code
#
# Usage:
#   bash install.sh [--global]
#
#   --global   installs to ~/.claude/skills/ (available in ALL projects)
#   (default)  installs to .claude/skills/ in the current directory
# ─────────────────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_FILE="$SCRIPT_DIR/../.claude/skills/fable5.md"

if [[ "$1" == "--global" ]]; then
  TARGET_DIR="$HOME/.claude/skills"
  SCOPE="global"
else
  TARGET_DIR="$(pwd)/.claude/skills"
  SCOPE="project"
fi

mkdir -p "$TARGET_DIR"
cp "$SKILL_FILE" "$TARGET_DIR/fable5.md"

echo ""
echo "✓ Fable 5 skill installed ($SCOPE)"
echo "  Location: $TARGET_DIR/fable5.md"
echo ""
echo "  Usage in Claude Code:"
echo "    /fable5"
echo ""
echo "  This activates Fable 5 thinking patterns on Claude Opus 4.8:"
echo "  - Adaptive thinking at xhigh effort"
echo "  - Self-verification before every progress report"
echo "  - Long-horizon autonomy (acts without over-asking)"
echo "  - Outcome-first communication"
echo "  - File-based memory system"
echo ""
