import { useEffect, useState } from 'react'
import { useMatches } from 'react-router'

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

// Re-renders once a minute, on the minute, rather than polling every second.
function useMinuteClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, 60_000 - (Date.now() % 60_000))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])
  return now
}

// Clock only for now; the weather chip comes with FR-WP-009 (S), per SRS v1.2.
export function Topbar() {
  const now = useMinuteClock()
  const title = useMatches()
    .map((m) => (m.handle as { title?: string } | undefined)?.title)
    .findLast(Boolean)

  return (
    <header className="topbar">
      <h1 className="topbar-title">{title}</h1>
      <time className="topbar-clock" dateTime={now.toISOString()}>
        {timeFmt.format(now)}
      </time>
    </header>
  )
}
