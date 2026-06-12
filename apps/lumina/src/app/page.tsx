import Link from "next/link";

const principles = [
  {
    title: "Pages within pages",
    body: "Your thinking has structure. Lumina mirrors it — nest pages as deep as the idea goes, and find them again instantly.",
  },
  {
    title: "Blocks, not boxes",
    body: "Headings, lists, to-dos, code, tables. Every block is a quiet, well-set piece of type that moves where you move.",
  },
  {
    title: "Yours, locally",
    body: "Everything lives on your device first. No account required to begin; sync arrives when you ask for it.",
  },
];

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6">
      <header className="flex items-center justify-between py-10">
        <span className="font-[family-name:var(--font-display)] text-xl tracking-[0.18em] uppercase">
          Lumina
        </span>
        <Link
          href="/app"
          className="rounded-full border border-[var(--line)] px-5 py-2 text-sm text-[var(--fg-muted)] transition-colors duration-300 hover:border-[var(--accent)] hover:text-[var(--fg)]"
        >
          Open workspace
        </Link>
      </header>

      <section className="flex flex-1 flex-col justify-center py-24">
        <p className="animate-rise text-xs tracking-[0.32em] uppercase text-[var(--accent)]">
          Notes · Pages · Databases
        </p>
        <h1
          className="animate-rise mt-6 font-[family-name:var(--font-display)] text-5xl leading-[1.08] sm:text-6xl"
          style={{ animationDelay: "80ms" }}
        >
          A quieter place
          <br />
          to think.
        </h1>
        <p
          className="animate-rise mt-8 max-w-md text-lg leading-relaxed text-[var(--fg-muted)]"
          style={{ animationDelay: "160ms" }}
        >
          Lumina is a workspace pared back to what matters: your words, your
          structure, and room to breathe.
        </p>
        <div
          className="animate-rise mt-12"
          style={{ animationDelay: "240ms" }}
        >
          <Link
            href="/app"
            className="inline-block rounded-full bg-[var(--fg)] px-8 py-3.5 text-sm tracking-wide text-[var(--bg)] transition-transform duration-300 hover:-translate-y-0.5"
          >
            Begin writing
          </Link>
        </div>
      </section>

      <section className="grid gap-12 border-t border-[var(--line)] py-20 sm:grid-cols-3">
        {principles.map((p) => (
          <div key={p.title}>
            <h2 className="font-[family-name:var(--font-display)] text-lg">
              {p.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--fg-muted)]">
              {p.body}
            </p>
          </div>
        ))}
      </section>

      <footer className="border-t border-[var(--line)] py-8 text-xs tracking-widest uppercase text-[var(--fg-faint)]">
        Lumina — crafted for clarity
      </footer>
    </main>
  );
}
