import type { ReactNode } from 'react'
import type { LayoutPage } from '../api/types'

/**
 * Phone pages: the page's widgets in order, one under the other, in one vertical scroll (FR-UI-009 as changed in
 * proposals §16.3). Hidden widgets are left out. QA pass 3 commit 4 turns these into sections with an edit sheet.
 */
export function PhonePage({ page, render }: { page: LayoutPage; render: (id: string) => ReactNode }) {
  return (
    <div className="phone-page">
      {page.widgets
        .filter((w) => !w.hidden)
        .map((w) => (
          <div key={w.id} className="phone-section">
            {render(w.id)}
          </div>
        ))}
    </div>
  )
}
