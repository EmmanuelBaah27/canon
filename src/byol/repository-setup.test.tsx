import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DesignSystemProposal } from '@byol/core'
import { RepositorySetup } from './repository-setup'
import { updateManifestPath } from './repository-setup-model'

const proposal: DesignSystemProposal = {
  repositoryId: 'repo-1', sourceCommit: 'a'.repeat(40), origin: 'inferred',
  manifest: {
    $schema: 'https://byol.dev/schemas/design-system.v1.json', version: 1,
    tokens: ['src/tokens.css'], components: ['src/components/Button.tsx'], rules: ['DESIGN_SYSTEM.md'], themes: [],
    validation: { hardcodedVisualValues: 'approval', sharedComponentBypass: 'approval', unknownBehavioralValues: 'notice' },
  },
  candidates: [{ path: 'src/tokens.css', role: 'tokens', confidence: 'medium', evidence: ['token path evidence'] }],
  ambiguities: [{ path: 'src/theme-components.ts', roles: ['tokens', 'components'], evidence: ['ambiguous name'] }],
}

describe('repository setup review', () => {
  it('renders the existing shared inputs, badges, separators, and approval button', () => {
    const html = renderToStaticMarkup(<RepositorySetup proposal={proposal} onApprove={() => undefined} />)
    expect(html).toContain('Review design system')
    expect(html).toContain('data-slot="input"')
    expect(html).toContain('data-slot="button"')
    expect(html).toContain('token path evidence')
    expect(html).toContain('Could be tokens or components')
    expect(html).toContain('Approve design system')
  })

  it('edits only the selected manifest path', () => {
    const next = updateManifestPath(proposal.manifest, 'tokens', 0, 'src/theme.css')
    expect(next.tokens).toEqual(['src/theme.css'])
    expect(next.components).toEqual(proposal.manifest.components)
    expect(proposal.manifest.tokens).toEqual(['src/tokens.css'])
  })
})
