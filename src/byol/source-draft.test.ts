import { describe, expect, it } from 'vitest'
import { createSourceDraft } from './source-draft'

const manifest = {
  schemaVersion: 1 as const, id: 'mande-input', repositoryId: 'mande', name: 'Input',
  source: { path: 'src/Input.tsx', commit: 'abc', exportName: 'Input' },
  tokens: [{ property: 'radius', category: 'radius', token: '--radius-control' }],
  states: [{ name: 'disabled', evidence: ['src/Input.tsx'] }], dependencies: [], assets: [],
}

describe('connected source drafts', () => {
  it('creates an ordinary temporary draft with immutable source and design-system metadata', () => {
    const draft = createSourceDraft({ manifest, approvedDesignSystem: { repositoryId: 'mande', sourceCommit: 'abc' },
      controls: [{ id: 'disabled', label: 'disabled', control: 'switch', section: 'properties', structural: false, defaultValue: false }],
      issues: [], values: { disabled: false }, behaviors: { keyboard: 'native' }, now: '2026-11-10T00:00:00.000Z' })
    expect(draft).toMatchObject({ status: 'temporary', repositoryId: 'mande', designSystemCommit: 'abc', values: { disabled: false }, behaviors: { keyboard: 'native' } })
    expect(draft.manifest.states).toEqual(manifest.states)
    expect(draft.manifest.tokens).toEqual(manifest.tokens)
    expect(draft).not.toHaveProperty('header')
    expect(draft).not.toHaveProperty('theme')
    manifest.tokens[0].token = 'mutated'
    expect(draft.manifest.tokens[0].token).toBe('--radius-control')
  })

  it('rejects repository and source-commit mismatches', () => {
    expect(() => createSourceDraft({ manifest, approvedDesignSystem: { repositoryId: 'other', sourceCommit: 'abc' }, controls: [], issues: [] })).toThrow(/different repositories/i)
    expect(() => createSourceDraft({ manifest, approvedDesignSystem: { repositoryId: 'mande', sourceCommit: 'new' }, controls: [], issues: [] })).toThrow(/stale/i)
  })
})
