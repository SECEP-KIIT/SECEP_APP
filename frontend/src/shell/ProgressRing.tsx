/**
 * Project marker with its progress ring (FR-UI-002, item 1: "coloured dots with names and progress rings"): the
 * project's colour dot sits inside an arc showing done / total. It lives in the icon column, so the ring shows in
 * the collapsed sidebar as well as the expanded one. The amber/red deadline states come with projects in task 10
 * (FR-UI-020).
 */
export function ProgressRing({ done, total, colour }: { done: number; total: number; colour: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <svg className="progress-ring" width="22" height="22" viewBox="0 0 22 22" role="img" aria-label={`${done} of ${total} done`}>
      <circle cx="11" cy="11" r="9" pathLength="100" className="progress-ring-track" />
      {pct > 0 && (
        <circle
          cx="11"
          cy="11"
          r="9"
          pathLength="100"
          stroke={colour}
          strokeDasharray={`${pct} 100`}
          transform="rotate(-90 11 11)"
          className="progress-ring-value"
        />
      )}
      <circle cx="11" cy="11" r="4" fill={colour} className="progress-ring-dot" />
    </svg>
  )
}
