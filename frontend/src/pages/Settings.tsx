import { Lock, Monitor, Moon, Palette, Sparkles, Sun, SunMedium } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useUpdatePreferences } from '../api/queries'
import type { UiPrefs } from '../api/types'
import { usePrefs } from '../shell/prefs'
import './settings.css'

/**
 * Settings (task 16, lean): the preferences stored in ui_prefs through PATCH /me/preferences (§6.5), saved as soon as
 * they change (optimistic, like the theme menu). Theme and motion (FR-UI-032), lock screen and idle return
 * (FR-WP-001/004), lock-screen subjects. Wallpaper places with photos and the weather chip (FR-WP-006–009), pop-up
 * rules (FR-REM-007), digest and reminder defaults are v2.
 */
export function Component() {
  const prefs = usePrefs()
  const update = useUpdatePreferences()
  const set = (patch: UiPrefs) => update.mutate(patch)

  return (
    <div className="settings">
      <Section icon={<Palette size={18} aria-hidden="true" />} title="Appearance">
        <Choice
          label="Theme"
          value={prefs.theme}
          options={[
            { key: 'light', label: 'Light', icon: <Sun size={15} aria-hidden="true" /> },
            { key: 'dark', label: 'Dark', icon: <Moon size={15} aria-hidden="true" /> },
            { key: 'auto', label: 'Auto', icon: <Monitor size={15} aria-hidden="true" /> },
          ]}
          hint="Auto follows your computer's light or dark setting."
          onChange={(theme) => set({ theme })}
        />
        <Choice
          label="Motion"
          value={prefs.motion ?? 'system'}
          options={[
            { key: 'system', label: 'System' },
            { key: 'full', label: 'Full' },
            { key: 'reduced', label: 'Reduced' },
            { key: 'off', label: 'Off' },
          ]}
          hint="Reduced swaps movement for quick fades and keeps the glow still. System follows your computer's reduce-motion setting."
          onChange={(m) => set({ motion: m === 'system' ? null : m })}
        />
        <Toggle label="Start with the sidebar collapsed" checked={prefs.sidebar_collapsed} onChange={(v) => set({ sidebar_collapsed: v })} />
      </Section>

      <Section icon={<Lock size={18} aria-hidden="true" />} title="Lock screen">
        <Toggle label="Skip the lock screen when SECEP opens" checked={prefs.skip_lock} onChange={(v) => set({ skip_lock: v })} />
        <Choice
          label="Return to the lock screen after"
          value={String(prefs.idle_minutes ?? 'off')}
          options={[
            { key: 'off', label: 'Never' },
            { key: '5', label: '5 min' },
            { key: '15', label: '15 min' },
            { key: '30', label: '30 min' },
            { key: '60', label: '1 h' },
          ]}
          hint="A privacy curtain that hides your mail when you step away. It isn't a password lock: your computer's own lock is."
          onChange={(v) => set({ idle_minutes: v === 'off' ? null : Number(v) })}
        />
        <Toggle
          label="Show subjects and event titles on the lock screen"
          checked={prefs.glance_subjects}
          hint="Off: the lock screen shows counts only, so people walking past can't read your mail."
          onChange={(v) => set({ glance_subjects: v })}
        />
      </Section>

      <Section icon={<SunMedium size={18} aria-hidden="true" />} title="Wallpaper">
        <p className="settings-note">The wallpaper follows the sun through dawn, day, golden hour, dusk and night. Your own photos and places come in a later version.</p>
      </Section>

      <Section icon={<Sparkles size={18} aria-hidden="true" />} title="About">
        <p className="settings-note">SECEP, the Smart Email Classifier. KIIT B.Tech CSE major project, 2026.</p>
      </Section>

      {update.isError && (
        <p className="settings-error" role="alert">
          Couldn't save that change. Try again.
        </p>
      )}
    </div>
  )
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="settings-section" aria-labelledby={id}>
      <h2 id={id}>
        {icon}
        {title}
      </h2>
      <div className="settings-rows">{children}</div>
    </section>
  )
}

/** A segmented radio group: each choice has a name (and maybe an icon), so the state is never colour alone. */
function Choice<K extends string>({ label, value, options, hint, onChange }: { label: string; value: K; options: { key: K; label: string; icon?: ReactNode }[]; hint?: string; onChange: (k: K) => void }) {
  const name = useId()
  return (
    <fieldset className="settings-row">
      <legend>{label}</legend>
      <div className="theme-options settings-choice">
        {options.map((o) => (
          <label key={o.key} className="theme-option" data-checked={value === o.key || undefined}>
            <input type="radio" name={name} value={o.key} checked={value === o.key} onChange={() => onChange(o.key)} />
            {o.icon}
            {o.label}
          </label>
        ))}
      </div>
      {hint && <p className="settings-hint">{hint}</p>}
    </fieldset>
  )
}

function Toggle({ label, checked, hint, onChange }: { label: string; checked: boolean; hint?: string; onChange: (v: boolean) => void }) {
  const hintId = useId()
  return (
    <div className="settings-row">
      <label className="settings-toggle">
        <span>{label}</span>
        <input type="checkbox" role="switch" checked={checked} aria-describedby={hint ? hintId : undefined} onChange={(e) => onChange(e.target.checked)} />
      </label>
      {hint && (
        <p id={hintId} className="settings-hint">
          {hint}
        </p>
      )}
    </div>
  )
}
