import type { DesignSystemManifest } from '@byol/core'

export type ManifestRole = 'tokens' | 'components' | 'rules'

export function updateManifestPath(
  manifest: DesignSystemManifest,
  role: ManifestRole,
  index: number,
  path: string,
): DesignSystemManifest {
  return { ...manifest, [role]: manifest[role].map((current, position) => position === index ? path : current) }
}
