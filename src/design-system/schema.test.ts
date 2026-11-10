import { describe, expect, test } from 'vitest'
import { DesignSystemManifestSchema } from './schema'

const validManifest = {
  $schema: 'https://byol.dev/schemas/design-system.v1.json',
  version: 1,
  tokens: ['src/index.css'],
  components: ['src/components/ui'],
  rules: ['AGENTS.md', 'TASTE.md', 'GRID.md', 'DESIGN_SYSTEM.md'],
  themes: ['light', 'dark'],
  validation: {
    hardcodedVisualValues: 'approval',
    sharedComponentBypass: 'approval',
    unknownBehavioralValues: 'notice',
  },
} as const

describe('DesignSystemManifestSchema', () => {
  test('accepts the internal design-system contract', () => {
    expect(DesignSystemManifestSchema.parse(validManifest)).toEqual(validManifest)
  })

  test.each([
    ['unknown keys', { ...validManifest, extra: true }],
    ['empty paths', { ...validManifest, tokens: [''] }],
    ['path traversal', { ...validManifest, rules: ['../AGENTS.md'] }],
    ['absolute POSIX paths', { ...validManifest, components: ['/src/components/ui'] }],
    ['absolute Windows paths', { ...validManifest, components: ['C:\\components'] }],
    ['duplicate evidence paths', { ...validManifest, rules: ['AGENTS.md', 'AGENTS.md'] }],
    ['unsupported versions', { ...validManifest, version: 2 }],
    [
      'unknown validation modes',
      {
        ...validManifest,
        validation: { ...validManifest.validation, hardcodedVisualValues: 'warn' },
      },
    ],
  ])('rejects %s', (_name, manifest) => {
    expect(() => DesignSystemManifestSchema.parse(manifest)).toThrow()
  })
})
