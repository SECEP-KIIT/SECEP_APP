import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createNote, deleteNote, notesOptions, patchNote, type NoteScope } from '../api/queries'
import type { Note } from '../api/types'
import { shellToast } from '../lib/toastBus'
import { useMinuteClock } from '../shell/useMinuteClock'
import { Markdown } from './markdown'
import { toggleTask } from './markdownModel'
import './notes.css'

const SAVE_DELAY = 800

interface Props {
  scope: NoteScope
  /** → Card / → Jira on each open checkbox line. */
  taskTools?: (text: string) => ReactNode
}

/**
 * The notes on an email, card or project, or the standalone ones (FR-CNT-003). Markdown-lite, rendered until
 * clicked, autosaved while typing (debounced) and on leaving the field, with "edited 2 min ago".
 */
export function NotesPanel({ scope, taskTools }: Props) {
  const notes = useQuery(notesOptions(scope))
  const [draft, setDraft] = useState<string | null>(null)

  if (notes.isPending) return <p className="drawer-muted">Loading notes…</p>
  if (notes.isError)
    return (
      <p className="drawer-muted" role="alert">
        Couldn't load notes.{' '}
        <button type="button" className="text-button" onClick={() => void notes.refetch()}>
          Try again
        </button>
      </p>
    )
  return (
    <div className="notes">
      {draft === null && (
        <button type="button" className="ghost-button notes-add" onClick={() => setDraft('')}>
          <Plus size={14} aria-hidden="true" />
          Add a note
        </button>
      )}
      {draft !== null && <NoteEditor key="draft" scope={scope} note={null} initial={draft} autoFocus onSettled={() => setDraft(null)} taskTools={taskTools} />}
      {notes.data.map((n) => (
        <NoteEditor key={n.id} scope={scope} note={n} initial={n.body} taskTools={taskTools} />
      ))}
    </div>
  )
}

function ago(iso: string, now: Date) {
  const min = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000))
  if (min < 1) return 'edited just now'
  if (min < 60) return `edited ${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `edited ${h} h ago`
  return `edited ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

export function NoteEditor({
  scope,
  note,
  initial,
  autoFocus = false,
  onSettled,
  taskTools,
}: {
  scope: NoteScope
  note: Note | null
  initial: string
  autoFocus?: boolean
  onSettled?: () => void
  taskTools?: (text: string) => ReactNode
}) {
  const [text, setText] = useState(initial)
  const [editing, setEditing] = useState(autoFocus)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const now = useMinuteClock()
  const area = useRef<HTMLTextAreaElement>(null)
  const id = useRef(note?.id ?? null)
  const sent = useRef(initial)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef(text)
  useEffect(() => {
    latest.current = text
  }, [text])

  const [savedAt, setSavedAt] = useState<string | null>(note?.updated_at ?? null)
  // Another tab or a toggle changed it while not editing: follow the server.
  const [lastBody, setLastBody] = useState(note?.body)
  if (note && note.body !== lastBody) {
    setLastBody(note.body)
    setSavedAt(note.updated_at)
    if (!editing) setText(note.body)
  }

  // Saves run one after another, so a second save never creates the note twice while the first is in flight.
  const scopeRef = useRef(scope)
  const settledRef = useRef(onSettled)
  useEffect(() => {
    scopeRef.current = scope
    settledRef.current = onSettled
  })
  const chain = useRef<Promise<void>>(Promise.resolve())
  const save = useCallback((body: string) => {
    window.clearTimeout(timer.current)
    const run = async () => {
      if (body === sent.current && id.current) return
      if (!id.current && !body.trim()) return
      setStatus('saving')
      sent.current = body
      try {
        const saved = id.current ? await patchNote(scopeRef.current, id.current, body) : await createNote(scopeRef.current, body)
        const wasNew = !id.current
        id.current = saved.id
        sent.current = saved.body
        setSavedAt(saved.updated_at)
        setStatus('idle')
        if (wasNew) settledRef.current?.()
      } catch {
        sent.current = ''
        setStatus('error')
      }
    }
    const p = chain.current.then(run)
    chain.current = p
    return p
  }, [])

  useEffect(() => {
    if (editing) area.current?.focus()
  }, [editing])
  // Leaving the page or closing the drawer: save what's there.
  useEffect(() => () => void save(latest.current), [save])

  const onChange = (v: string) => {
    setText(v)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void save(v), SAVE_DELAY)
  }

  const remove = async () => {
    if (!note) {
      onSettled?.()
      return
    }
    const body = text
    await deleteNote(scope, note).catch(() => setStatus('error'))
    onSettled?.()
    shellToast('Note deleted', 'info', { label: 'Undo', run: () => void createNote(scope, body) })
  }

  return (
    <article className="note" data-editing={editing || undefined}>
      {editing ? (
        <textarea
          ref={area}
          className="note-input"
          value={text}
          rows={Math.min(14, Math.max(4, text.split('\n').length + 1))}
          maxLength={20_000}
          aria-label="Note"
          placeholder="Jot down what you want to see before the meeting…"
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            void save(text)
            if (!text.trim() && !note) onSettled?.()
            else setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              e.currentTarget.blur()
            }
          }}
        />
      ) : (
        <div
          className="note-view"
          role="button"
          tabIndex={0}
          aria-label="Edit note"
          onClick={(e) => !(e.target as HTMLElement).closest('a, button, input') && setEditing(true)}
          onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && setEditing(true)}
        >
          {text.trim() ? (
            <Markdown
              body={text}
              taskTools={taskTools}
              onToggle={(line) => {
                const next = toggleTask(text, line)
                setText(next)
                void save(next)
              }}
            />
          ) : (
            <span className="drawer-muted">Empty note</span>
          )}
        </div>
      )}
      <footer className="note-foot">
        <span className="drawer-muted" aria-live="polite">
          {status === 'saving' ? 'Saving…' : status === 'error' ? "Couldn't save. It will retry when you edit." : savedAt ? ago(savedAt, now) : 'Not saved yet'}
        </span>
        <button type="button" className="icon-button" aria-label="Delete note" onMouseDown={(e) => e.preventDefault()} onClick={() => void remove()}>
          <Trash2 size={13} aria-hidden="true" />
        </button>
      </footer>
    </article>
  )
}
