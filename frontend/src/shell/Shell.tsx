import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router'
import { FocusContext, useFocusMode } from './focusMode'
import { LockSlots } from './LockSlots'
import { useApplyPrefs, usePrefs } from './prefs'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { Topbar } from './Topbar'
import { useBootSteps } from './useBootSteps'

/** Announces focus-mode changes, but not the initial state. */
function useFocusAnnouncement(focused: boolean) {
  const [message, setMessage] = useState('')
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setMessage(focused ? 'Focus mode on: Critical and High only' : 'Focus mode off')
  }, [focused])
  return message
}

// The floating sheet (FR-UI-001): inset over the wallpaper, frosted bars, solid content. It sits behind the static
// lock screen while booting and rises into place when the lock opens (lock.css, html[data-lock]).
export function Shell() {
  useBootSteps()
  useApplyPrefs()
  const focused = useFocusMode()
  const announcement = useFocusAnnouncement(focused)
  const { sidebar_collapsed } = usePrefs()

  return (
    <FocusContext.Provider value={focused}>
      <div className="sheet" data-focus={focused || undefined} data-collapsed={sidebar_collapsed || undefined}>
        <Sidebar />
        <Topbar />
        <main className="sheet-content">
          <Outlet />
        </main>
        <TabBar />
      </div>
      <LockSlots />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </FocusContext.Provider>
  )
}
