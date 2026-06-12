"use client";

import { breadcrumbOf, childrenOf, Page, pageTitle } from "@/lib/model";
import { createPage, openPage, updatePage, useWorkspace } from "@/lib/store";
import Editor from "./Editor";
import IconPicker from "./IconPicker";

export default function PageView({ page }: { page: Page }) {
  const ws = useWorkspace();
  const trail = breadcrumbOf(ws, page.id);
  const subPages = childrenOf(ws, page.id);

  return (
    <article className="mx-auto max-w-2xl px-8 py-12">
      <nav
        aria-label="Breadcrumb"
        className="mb-10 flex flex-wrap items-center gap-1.5 text-xs text-[var(--fg-faint)]"
      >
        {trail.map((p) => (
          <span key={p.id} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => openPage(p.id)}
              className="rounded px-1 py-0.5 transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--fg)]"
            >
              {p.icon} {pageTitle(p)}
            </button>
            <span className="select-none">/</span>
          </span>
        ))}
        <span className="px-1 text-[var(--fg-muted)]">
          {page.icon} {pageTitle(page)}
        </span>
      </nav>

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
      <section className="mt-8">
        {subPages.length > 0 && (
          <div className="mb-6 border-l-2 border-[var(--line)] pl-4">
            {subPages.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => openPage(sub.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--fg)]"
              >
                <span>{sub.icon}</span>
                <span className="underline decoration-[var(--line)] underline-offset-4">
                  {pageTitle(sub)}
                </span>
              </button>
            ))}
          </div>
        )}
        <Editor page={page} />
        <button
          type="button"
          onClick={() => createPage(page.id)}
          className="mt-2 rounded-md px-2 py-1.5 text-xs tracking-wide text-[var(--fg-faint)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--fg)]"
        >
          ＋ Add sub-page
        </button>
      </section>
    </article>
  );
}
