"use client";

import { Page } from "@/lib/model";
import { updatePage } from "@/lib/store";
import IconPicker from "./IconPicker";

export default function PageView({ page }: { page: Page }) {
  return (
    <article className="mx-auto max-w-2xl px-8 py-16">
      <IconPicker
        value={page.icon}
        onChange={(icon) => updatePage(page.id, { icon })}
      />
      <input
        value={page.title}
        onChange={(e) => updatePage(page.id, { title: e.target.value })}
        placeholder="Untitled"
        aria-label="Page title"
        className="mt-4 w-full bg-transparent font-[family-name:var(--font-display)] text-4xl outline-none placeholder:text-[var(--fg-faint)]"
      />
      <div className="mt-8 text-sm leading-relaxed text-[var(--fg-faint)]">
        {page.blocks.length === 1 && !page.blocks[0].text ? (
          <p>An empty page. The block editor arrives here next.</p>
        ) : (
          page.blocks.map((b) => <p key={b.id}>{b.text}</p>)
        )}
      </div>
    </article>
  );
}
