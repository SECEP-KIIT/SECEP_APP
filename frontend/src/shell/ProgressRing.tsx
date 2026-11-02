/** Small project progress ring (FR-UI-002). The amber/red deadline states come with projects in task 10 (FR-UI-020). */
export function ProgressRing({ done, total, colour }: { done: number; total: number; colour: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <svg className="progress-ring" width="16" height="16" viewBox="0 0 16 16" role="img" aria-label={`${done} of ${total} done`}>
      <circle cx="8" cy="8" r="6" pathLength="100" className="progress-ring-track" />
      <circle
        cx="8"
        cy="8"
        r="6"
        pathLength="100"
        stroke={colour}
        strokeDasharray={`${pct} 100`}
        transform="rotate(-90 8 8)"
        className="progress-ring-value"
      />
    </svg>
  )
}
