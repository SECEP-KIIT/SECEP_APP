import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useGlance, useMe } from '../api/queries'
import type { AdminMetrics, EmailType } from '../api/types'
import './stats.css'

const TYPES: EmailType[] = ['Task', 'Meeting', 'Approval', 'Info', 'Credentials']

/**
 * Stats (the Metrics page as a home widget, 19 Nov 2026). Everyone: today's counts from GET /me/glance. Admins also
 * get the classifier over 30 days from GET /admin/metrics (§6.5, admin-only): volume per type, how often people
 * corrected each type, and how confident it was. Bars carry their numbers as text, never length alone.
 */
export function StatsWidget() {
  const glance = useGlance()
  const { data: me } = useMe()
  const admin = !!me?.is_admin
  const metrics = useQuery({ queryKey: ['admin', 'metrics', 30], queryFn: () => api<AdminMetrics>('/admin/metrics?days=30'), enabled: admin, staleTime: 5 * 60_000 })
  const c = glance.data?.counts

  return (
    <div className="stats">
      <section aria-label="Right now">
        <h4 className="stats-head">Right now</h4>
        {c ? (
          <ul className="stats-tiles">
            <Tile label="Unread" value={c.inbox_unread} />
            <Tile label="Critical unread" value={c.critical_unread} tone="crit" />
            <Tile label="Due today" value={c.due_today} />
            <Tile label="Overdue" value={c.overdue} tone="warn" />
            <Tile label="Board to do" value={c.board_todo} />
            {c.security_flags !== null && <Tile label="Security flags" value={c.security_flags} />}
          </ul>
        ) : (
          <p className="col-state">{glance.isError ? "Couldn't load the counts." : 'Loading…'}</p>
        )}
      </section>

      {admin && (
        <section aria-label="Classifier, last 30 days">
          <h4 className="stats-head">Classifier · last 30 days</h4>
          {metrics.data ? <Classifier m={metrics.data} /> : <p className="col-state">{metrics.isError ? "Couldn't load the classifier metrics." : 'Loading…'}</p>}
        </section>
      )}
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'crit' | 'warn' }) {
  return (
    <li className="stats-tile" data-tone={tone}>
      <span className="stats-num">{value}</span>
      <span className="stats-label">{label}</span>
    </li>
  )
}

function Classifier({ m }: { m: AdminMetrics }) {
  const total = TYPES.reduce((s, t) => s + (m.volume_by_type[t] ?? 0), 0)
  const maxType = Math.max(1, ...TYPES.map((t) => m.volume_by_type[t] ?? 0))
  const maxBin = Math.max(1, ...m.confidence_histogram.map((b) => b.count))
  const pct = (x: number) => `${Math.round(x * 100)} %`
  return (
    <>
      <table className="stats-table">
        <caption className="sr-only">Emails per type and how often the label was corrected</caption>
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Emails</th>
            <th scope="col">Corrected</th>
          </tr>
        </thead>
        <tbody>
          {TYPES.map((t) => {
            const n = m.volume_by_type[t] ?? 0
            return (
              <tr key={t}>
                <th scope="row">{t}</th>
                <td>
                  <span className="stats-bar" aria-hidden="true">
                    <span style={{ transform: `scaleX(${n / maxType})` }} />
                  </span>
                  {n}
                </td>
                <td>{pct(m.override_rate_by_class[t] ?? 0)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="stats-sub">
        {total} emails classified. Confidence:
      </p>
      <ol className="stats-hist" aria-label="Emails per confidence band">
        {m.confidence_histogram.map((b) => (
          <li key={b.bin_start} title={`${pct(b.bin_start)}–${pct(b.bin_end)}: ${b.count}`}>
            <span className="stats-col" aria-hidden="true">
              <span style={{ transform: `scaleY(${b.count / maxBin})` }} />
            </span>
            <span className="sr-only">
              {pct(b.bin_start)} to {pct(b.bin_end)}: {b.count}
            </span>
          </li>
        ))}
      </ol>
      <p className="stats-axis" aria-hidden="true">
        <span>0 %</span>
        <span>100 %</span>
      </p>
    </>
  )
}
