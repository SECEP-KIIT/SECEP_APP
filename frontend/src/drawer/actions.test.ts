// Task 7 client paths against the real mock (msw/node): handled removal, accept, links, .ics.
import { setupServer } from 'msw/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptAction, emailListOptions, followLink, queryClient, rejectAction, updateEmail } from '../api/queries'
import { apiBlob } from '../api/client'
import type { EmailDetail, EmailListItem, Page } from '../api/types'
import { control } from '../mocks/control'
import { handlers } from '../mocks/handlers'
import { signIn } from '../mocks/session'
import { db, initStore } from '../mocks/store/db'

vi.stubGlobal('location', new URL('http://localhost/'))
const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
beforeEach(() => {
  initStore({ persistEnabled: false })
  control.latency = [0, 0]
  control.speed = 1000
  control.jiraMode = 'ok'
  signIn(db.users[0].id)
  queryClient.clear()
})

const items = (query: string) => queryClient.getQueryData<{ pages: Page<EmailListItem>[] }>(emailListOptions(query).queryKey)!.pages.flatMap((p) => p.items)

describe('drawer and quick actions (task 7)', () => {
  it('Done (handled) leaves the default inbox in place and joins nothing it does not match', async () => {
    await queryClient.fetchInfiniteQuery(emailListOptions(''))
    await queryClient.fetchInfiniteQuery(emailListOptions('view=handled'))
    const before = items('')
    const target = before[3]
    const detail = await updateEmail(target.id, { handled: true })
    expect(detail.handled).toBe(true)
    expect(items('').map((e) => e.id)).toEqual(before.filter((e) => e.id !== target.id).map((e) => e.id))
    expect(queryClient.getQueryData<EmailDetail>(['email', target.id])?.handled).toBe(true)

    // Restoring removes it from the Handled view list (it no longer matches) without inserting into the inbox list.
    await queryClient.fetchInfiniteQuery(emailListOptions('view=handled'))
    expect(items('view=handled').some((e) => e.id === target.id)).toBe(false) // cached before the change
    queryClient.removeQueries({ queryKey: emailListOptions('view=handled').queryKey })
    await queryClient.fetchInfiniteQuery(emailListOptions('view=handled'))
    expect(items('view=handled').some((e) => e.id === target.id)).toBe(true)
    await updateEmail(target.id, { handled: false })
    expect(items('view=handled').some((e) => e.id === target.id)).toBe(false)
    expect(items('').some((e) => e.id === target.id)).toBe(false) // comes back via "↑ n new" / refetch, never inserted
  })

  it('accept sends the proposal and patches the open detail; a 502 refetches it as failed', async () => {
    const row = [...db.actions.values()].find((a) => a.user_id === db.users[0].id && a.type === 'create_jira_issue' && a.status === 'proposed')!
    const detail = await queryClient.fetchQuery({ queryKey: ['email', row.email_id], queryFn: () => import('../api/client').then(({ api }) => api<EmailDetail>(`/emails/${row.email_id}`)) })
    const action = detail.actions.find((a) => a.id === row.id)!
    const done = await acceptAction(action)
    expect(done).toMatchObject({ status: 'done', external_ref: expect.stringMatching(/^[A-Z]+-\d+$/) })
    expect(queryClient.getQueryData<EmailDetail>(['email', row.email_id])!.actions.find((a) => a.id === row.id)?.status).toBe('done')

    const other = [...db.actions.values()].find((a) => a.user_id === db.users[0].id && a.type === 'create_jira_issue' && a.status === 'proposed')!
    control.jiraMode = 'server_error'
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    await expect(acceptAction({ ...(await import('../mocks/store/serialize')).toAction(other) })).rejects.toMatchObject({ status: 502, code: 'upstream_error' })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['email', other.email_id] })
    spy.mockRestore()
  })

  it('reject marks the proposal declined', async () => {
    const row = [...db.actions.values()].find((a) => a.user_id === db.users[0].id && a.status === 'proposed')!
    const { toAction } = await import('../mocks/store/serialize')
    expect((await rejectAction(toAction(row))).status).toBe('rejected')
  })

  it('followLink returns the §6.4.1 click-time shapes: open, interstitial, blocked', async () => {
    const mine = db.urlChecks.filter((c) => db.emails.get(c.email_id)?.user_id === db.users[0].id)
    const go = (v: string) => followLink(`/api/v1/links/${mine.find((c) => c.verdict === v)!.id}/go`)
    expect(await go('clean')).toMatchObject({ action: 'open', url: expect.stringMatching(/^https?:/) })
    expect(await go('suspicious')).toMatchObject({ action: 'interstitial', verdict: 'suspicious', chain: expect.any(Array), signals: expect.any(Array) })
    const blocked = await go('malicious')
    expect(blocked).toMatchObject({ action: 'blocked', verdict: 'malicious' })
    expect(blocked).not.toHaveProperty('url')
  })

  it('the .ics download is a text/calendar file through the authenticated client', async () => {
    const meeting = [...db.actions.values()].find((a) => a.user_id === db.users[0].id && a.type === 'add_calendar_event' && db.emails.get(a.email_id!)?.triage?.email_type.label === 'Meeting')!
    const blob = await apiBlob(`/emails/${meeting.email_id}/ics`, { headers: { Accept: 'text/calendar' } })
    expect(await blob.text()).toMatch(/^BEGIN:VCALENDAR/)
  })
})
