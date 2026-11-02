import { X } from 'lucide-react'
import type { Toast } from './inboxContext'

/** Toasts slide up from the bottom (item 9). Errors use role="alert"; everything else is a polite status. */
export function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-tone={t.tone} role={t.tone === 'error' ? 'alert' : 'status'}>
          <span>{t.message}</span>
          <button type="button" className="toast-close" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
