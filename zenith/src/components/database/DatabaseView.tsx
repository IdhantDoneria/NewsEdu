// STUB — replaced by the Databases agent.
// Contract:
//   export function DatabaseFullPage({ page }: { page: PageDoc }): JSX.Element
//     – full database experience for a page with page.type === 'database'
//   export function RowPropsSection({ page }: { page: PageDoc }): JSX.Element
//     – property editor strip shown at top of a row page (page.databaseId set)
import { createPage, getRows, openPeek, useStore } from '../../lib/store';
import type { PageDoc } from '../../lib/types';

export function DatabaseFullPage({ page }: { page: PageDoc }) {
  useStore((s) => s.navTick);
  const rows = getRows(page.id);
  return (
    <div style={{ marginTop: 12 }}>
      <table className="tbl" style={{ width: '100%' }}>
        <tbody>
          <tr className="hdr"><td>Name</td></tr>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ cursor: 'pointer' }} onClick={() => openPeek(r.id)}>
                {r.icon ? r.icon + ' ' : ''}{r.title || 'Untitled'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn small" style={{ marginTop: 8 }} onClick={() => openPeek(createPage({ parentId: page.id, databaseId: page.id }))}>
        + New
      </button>
    </div>
  );
}

export function RowPropsSection({ page }: { page: PageDoc }) {
  void page;
  return null;
}
