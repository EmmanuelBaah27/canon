import type { ComponentManifest } from '@byol/core';

export const manifest: ComponentManifest = {
  schemaVersion: 1,
  id: 'mande-checkbox',
  repositoryId: 'mande',
  name: 'Checkbox',
  source: { path: 'src/components/Checkbox.tsx', commit: 'source-commit', exportName: 'Checkbox' },
  tokens: [
    { property: 'borderColor', category: 'color', token: 'tokens.color.border' },
    { property: 'width', category: 'size', token: 'tokens.size.control' },
    { property: 'color', category: 'color', token: 'var(--mande-color-text, #000)' },
    { property: 'border', category: 'border', token: '1px solid var(--mande-border)' },
  ],
  states: [{ name: 'checked', evidence: ['src/components/Checkbox.tsx'] }],
  dependencies: [{ specifier: '@radix-ui/react-checkbox' }],
  assets: [],
};

export const tokenIndex = [
  ...manifest.tokens.map(({ category, token }) => ({ category, token })),
  { category: 'color', token: 'tokens.color.accent' },
];
