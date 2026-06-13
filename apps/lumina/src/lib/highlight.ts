// Minimal dependency-free syntax highlighter for code blocks.
// Returns HTML with <span class="tok-*"> wrappers; input is fully escaped.

const KEYWORDS: Record<string, string[]> = {
  javascript: "const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this super null undefined true false yield static get set delete void".split(" "),
  typescript: "const let var function return if else for while do switch case break continue new class extends implements interface type enum import export from default async await try catch finally throw typeof instanceof in of this super null undefined true false yield static readonly public private protected abstract namespace declare as is keyof infer never unknown any string number boolean object symbol void get set delete".split(" "),
  python: "def return if elif else for while in not and or is None True False class import from as with try except finally raise lambda global nonlocal pass break continue yield async await del assert match case".split(" "),
  json: "true false null".split(" "),
  css: "important inherit initial unset auto none".split(" "),
  bash: "if then else elif fi for while do done case esac function in echo exit return local export readonly cd source set unset shift".split(" "),
  html: [],
};

const ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Rule {
  cls: string;
  re: RegExp;
}

function rulesFor(lang: string): Rule[] {
  const rules: Rule[] = [];
  if (lang === "python" || lang === "bash") {
    rules.push({ cls: "tok-c", re: /#[^\n]*/y });
  } else if (lang === "html") {
    rules.push({ cls: "tok-c", re: /<!--[\s\S]*?-->/y });
  } else {
    rules.push({ cls: "tok-c", re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y });
  }
  rules.push({
    cls: "tok-s",
    re: /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/y,
  });
  rules.push({ cls: "tok-n", re: /\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b/iy });
  if (lang === "html") {
    rules.push({ cls: "tok-k", re: /<\/?[a-zA-Z][\w-]*|\/?>/y });
    rules.push({ cls: "tok-a", re: /\b[a-zA-Z-]+(?==)/y });
  } else {
    const kws = KEYWORDS[lang] ?? KEYWORDS.javascript;
    if (kws.length > 0) {
      rules.push({
        cls: "tok-k",
        re: new RegExp(`\\b(?:${kws.join("|")})\\b`, "y"),
      });
    }
    rules.push({ cls: "tok-f", re: /\b[a-zA-Z_$][\w$]*(?=\s*\()/y });
  }
  return rules;
}

export function highlight(code: string, language: string): string {
  const lang = ALIASES[language] ?? language;
  const rules = rulesFor(lang);
  let out = "";
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) {
      out += escapeHtml(plain);
      plain = "";
    }
  };
  while (i < code.length) {
    let matched = false;
    for (const { cls, re } of rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m[0].length > 0) {
        flush();
        out += `<span class="${cls}">${escapeHtml(m[0])}</span>`;
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      plain += code[i];
      i += 1;
    }
  }
  flush();
  return out;
}
