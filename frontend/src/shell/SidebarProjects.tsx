import { Plus } from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router'
import { emailProjects, setEmailsInProject, useProjects } from '../api/queries'
import type { Project } from '../api/types'
import { hasFiles, uploadAll } from '../files/upload'
import { carriesEmails, droppedEmails } from '../lib/dragEmails'
import { shellToast } from '../lib/toastBus'
import { openProjectDialog } from '../projects/dialogBus'
import { ringTone, toneColour, toneLabel } from '../projects/projectModel'
import { ProgressRing } from './ProgressRing'
import { useMinuteClock } from './useMinuteClock'

/**
 * The sidebar's projects (FR-UI-002, item 1): coloured dots with progress rings, a + for a new project, and the
 * archived ones folded away (archiving replaces deletion, FR-UI-016). Dropping email cards on a project adds them to
 * it (FR-UI-028), with Undo.
 */
export function SidebarProjects() {
  const { data } = useProjects()
  const now = useMinuteClock()
  const items = data?.items ?? []
  const active = items.filter((p) => !p.archived_at)
  const archived = items.filter((p) => p.archived_at)
  if (!data) return null

  return (
    <section className="nav-projects" aria-labelledby="nav-projects-title">
      <h2 id="nav-projects-title" className="nav-heading">
        <span className="nav-label">Projects</span>
        <button type="button" className="nav-add" onClick={() => openProjectDialog()} title="New project">
          <Plus size={14} aria-hidden="true" />
          <span className="sr-only">New project</span>
        </button>
      </h2>
      <ul className="nav">
        {active.map((p) => (
          <ProjectLink key={p.id} project={p} now={now} />
        ))}
      </ul>
      {archived.length > 0 && (
        <details className="nav-archived">
          <summary className="nav-heading">
            <span className="nav-label">Archived ({archived.length})</span>
          </summary>
          <ul className="nav">
            {archived.map((p) => (
              <ProjectLink key={p.id} project={p} now={now} />
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function ProjectLink({ project: p, now }: { project: Project; now: Date }) {
  const [over, setOver] = useState(false)
  const tone = ringTone(p, now)
  const canDrop = !p.archived_at

  const drop = async (ids: string[]) => {
    const adding = ids.filter((id) => !emailProjects(id).some((r) => r.id === p.id))
    if (!adding.length) return shellToast(ids.length === 1 ? `Already in ${p.name}` : `Already all in ${p.name}`)
    try {
      await setEmailsInProject(p, adding, true)
      shellToast(`Added ${adding.length === 1 ? '' : `${adding.length} emails `}to ${p.name}`, 'info', {
        label: 'Undo',
        run: () => void setEmailsInProject(p, adding, false).catch(() => shellToast("Couldn't undo", 'error')),
      })
    } catch {
      shellToast(`Couldn't add to ${p.name}`, 'error')
    }
  }

  const dropFiles = async (files: File[]) => {
    if (!files.length) return
    const failed = await uploadAll({ type: 'project', id: p.id }, files)
    const ok = files.length - failed
    if (ok) shellToast(`Attached ${ok === 1 ? files[0].name : `${ok} files`} to ${p.name}`)
    if (failed) shellToast(failed === 1 ? "Couldn't attach one file (25 MB limit, or your quota)" : `Couldn't attach ${failed} files`, 'error')
  }

  return (
    <li>
      <NavLink
        to={`/projects/${p.id}`}
        className="nav-link"
        data-drop={over || undefined}
        data-archived={p.archived_at ? '' : undefined}
        onDragOver={(e) => {
          if (!canDrop || !(carriesEmails(e) || hasFiles(e))) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!canDrop) return
          if (hasFiles(e)) {
            e.preventDefault()
            setOver(false)
            void dropFiles([...e.dataTransfer.files])
            return
          }
          if (!carriesEmails(e)) return
          e.preventDefault()
          setOver(false)
          void drop(droppedEmails(e))
        }}
      >
        <span className="nav-icon">
          <ProgressRing done={p.progress.done} total={p.progress.total} colour={p.colour} stroke={toneColour(tone, p.colour)} warning={toneLabel(tone)} />
        </span>
        <span className="nav-label">
          {p.icon && <span aria-hidden="true">{p.icon} </span>}
          {p.name}
        </span>
      </NavLink>
    </li>
  )
}
