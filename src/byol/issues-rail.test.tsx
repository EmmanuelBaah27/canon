import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { Issue } from '@byol/core'
import { IssuesRail } from './issues-rail'

const issue = (id: string, type: Issue['type'], severity: Issue['severity']): Issue => ({ id, type, severity, draftId: 'draft', target: { kind: 'component', id: 'Input' }, message: `${type} notice`, resolutionActions: ['review'], createdAt: '2026-11-10T00:00:00.000Z' })

it('uses one issue count, category filters, and auto-expands only when a blocker exists', () => {
  const html = renderToStaticMarkup(<IssuesRail issues={[issue('1', 'override', 'warning'), issue('2', 'behavioral-addition', 'information'), issue('3', 'violation', 'blocker')]} />)
  expect(html).toContain('Issues · 3')
  expect(html).toContain('override')
  expect(html).toContain('behavioral addition')
  expect(html).toContain('violation')
})

it('starts collapsed when there are notices but no blockers and disappears when empty', () => {
  expect(renderToStaticMarkup(<IssuesRail issues={[issue('1', 'override', 'warning')]} />)).toContain('Expand 1 issues')
  expect(renderToStaticMarkup(<IssuesRail issues={[]} />)).toBe('')
})
