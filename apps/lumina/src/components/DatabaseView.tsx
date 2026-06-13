"use client";

import {
  Database,
  DatabaseProperty,
  DatabaseRow,
  Page,
  PropertyType,
  uid,
} from "@/lib/model";
import { updatePage } from "@/lib/store";

const PROPERTY_TYPES: PropertyType[] = ["text", "select", "date", "checkbox"];

export default function DatabaseView({ page }: { page: Page }) {
  const db: Database = page.database ?? { properties: [], rows: [] };

  const commit = (next: Database) => updatePage(page.id, { database: next });

  const addProperty = () =>
    commit({
      ...db,
      properties: [
        ...db.properties,
        { id: uid(), name: `Property ${db.properties.length + 1}`, type: "text" },
      ],
    });

  const updateProperty = (id: string, patch: Partial<DatabaseProperty>) =>
    commit({
      ...db,
      properties: db.properties.map((p) =>
        p.id === id ? { ...p, ...patch } : p,
      ),
    });

  const deleteProperty = (id: string) =>
    commit({
      ...db,
      properties: db.properties.filter((p) => p.id !== id),
      rows: db.rows.map((r) => {
        const values = { ...r.values };
        delete values[id];
        return { ...r, values };
      }),
    });

  const addRow = () =>
    commit({ ...db, rows: [...db.rows, { id: uid(), values: {} }] });

  const deleteRow = (id: string) =>
    commit({ ...db, rows: db.rows.filter((r) => r.id !== id) });

  const setCell = (row: DatabaseRow, prop: DatabaseProperty, value: string) => {
    const rows = db.rows.map((r) =>
      r.id === row.id ? { ...r, values: { ...r.values, [prop.id]: value } } : r,
    );
    // remember new select options so they show up in other rows
    let properties = db.properties;
    if (prop.type === "select" && value && !(prop.options ?? []).includes(value)) {
      properties = properties.map((p) =>
        p.id === prop.id ? { ...p, options: [...(p.options ?? []), value] } : p,
      );
    }
    commit({ ...db, rows, properties });
  };

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {db.properties.map((prop) => (
              <th
                key={prop.id}
                className="group min-w-40 border border-[var(--line)] bg-[var(--bg-sunken)] px-2 py-1.5 text-left font-normal"
              >
                <div className="flex items-center gap-1">
                  <input
                    value={prop.name}
                    aria-label="Property name"
                    onChange={(e) =>
                      updateProperty(prop.id, { name: e.target.value })
                    }
                    className="w-full min-w-0 bg-transparent text-xs font-medium tracking-wide text-[var(--fg-muted)] uppercase outline-none"
                  />
                  <select
                    value={prop.type}
                    aria-label="Property type"
                    onChange={(e) =>
                      updateProperty(prop.id, {
                        type: e.target.value as PropertyType,
                      })
                    }
                    className="bg-transparent text-[10px] text-[var(--fg-faint)] outline-none"
                  >
                    {PROPERTY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`Delete property ${prop.name}`}
                    onClick={() => deleteProperty(prop.id)}
                    className="hidden text-xs text-[var(--fg-faint)] group-hover:block hover:text-red-400"
                  >
                    ×
                  </button>
                </div>
              </th>
            ))}
            <th className="w-10 border border-[var(--line)] bg-[var(--bg-sunken)]">
              <button
                type="button"
                aria-label="Add property"
                onClick={addProperty}
                className="w-full py-1.5 text-[var(--fg-faint)] transition-colors hover:text-[var(--accent)]"
              >
                ＋
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {db.rows.map((row) => (
            <tr key={row.id} className="group">
              {db.properties.map((prop) => {
                const value = row.values[prop.id] ?? "";
                return (
                  <td
                    key={prop.id}
                    className="border border-[var(--line)] px-2 py-1.5 align-top"
                  >
                    {prop.type === "checkbox" ? (
                      <input
                        type="checkbox"
                        checked={value === "true"}
                        onChange={(e) =>
                          setCell(row, prop, e.target.checked ? "true" : "")
                        }
                        className="accent-[var(--accent)]"
                      />
                    ) : prop.type === "date" ? (
                      <input
                        type="date"
                        value={value}
                        onChange={(e) => setCell(row, prop, e.target.value)}
                        className="bg-transparent outline-none"
                      />
                    ) : prop.type === "select" ? (
                      <>
                        <input
                          value={value}
                          list={`opts-${prop.id}`}
                          placeholder="—"
                          onChange={(e) => setCell(row, prop, e.target.value)}
                          className="w-full bg-transparent outline-none placeholder:text-[var(--fg-faint)]"
                        />
                        <datalist id={`opts-${prop.id}`}>
                          {(prop.options ?? []).map((o) => (
                            <option key={o} value={o} />
                          ))}
                        </datalist>
                      </>
                    ) : (
                      <input
                        value={value}
                        placeholder="—"
                        onChange={(e) => setCell(row, prop, e.target.value)}
                        className="w-full bg-transparent outline-none placeholder:text-[var(--fg-faint)]"
                      />
                    )}
                  </td>
                );
              })}
              <td className="border border-[var(--line)] text-center">
                <button
                  type="button"
                  aria-label="Delete row"
                  onClick={() => deleteRow(row.id)}
                  className="hidden text-xs text-[var(--fg-faint)] group-hover:inline hover:text-red-400"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 rounded-md px-2 py-1.5 text-xs tracking-wide text-[var(--fg-faint)] transition-colors hover:bg-[var(--bg-sunken)] hover:text-[var(--fg)]"
      >
        ＋ New row
      </button>
    </div>
  );
}
