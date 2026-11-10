import manifest from '../../byol.design-system.json'
import { DesignSystemManifestSchema, type DesignSystemManifest } from './schema'

function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) freeze(nested)
    Object.freeze(value)
  }
  return value
}

export const internalDesignSystem: Readonly<DesignSystemManifest> = freeze(
  DesignSystemManifestSchema.parse(manifest),
)
