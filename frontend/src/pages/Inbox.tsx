import { useEffect, useState } from 'react'
import { Column } from '../inbox/Column'
import { Legend } from '../inbox/Legend'
import { isTypingTarget } from '../shell/focusKeys'

// The Inbox full view: one column widget (FR-UI-006). The tiling dashboard (task 8) puts several on a page.
export function Component() {
  const [legend, setLegend] = useState(false)

  // `?` shows the card legend (FR-UI-014). Never while typing or with a modifier (Shift is how `?` is typed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      e.preventDefault()
      setLegend(true)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="inbox-page">
      <Column title="Inbox" onLegend={() => setLegend(true)} />
      <Legend open={legend} onClose={() => setLegend(false)} />
    </div>
  )
}
