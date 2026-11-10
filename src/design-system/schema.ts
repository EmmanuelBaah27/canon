import { z } from 'zod'

const RepositoryPath = z.string().trim().min(1).refine((path) => {
  if (path.includes('\0') || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false
  return !path.split('/').some((segment) => segment === '..' || segment === '')
}, 'Must be a normalized repository-relative path')

const uniquePaths = z.array(RepositoryPath).refine(
  (paths) => new Set(paths).size === paths.length,
  'Paths must not be duplicated',
)

const ValidationMode = z.enum(['approval', 'notice', 'ignore'])

export const DesignSystemManifestSchema = z.strictObject({
  $schema: z.literal('https://byol.dev/schemas/design-system.v1.json'),
  version: z.literal(1),
  tokens: uniquePaths,
  components: uniquePaths,
  rules: uniquePaths,
  themes: z.array(z.string().trim().min(1)).refine(
    (themes) => new Set(themes).size === themes.length,
    'Themes must not be duplicated',
  ),
  validation: z.strictObject({
    hardcodedVisualValues: ValidationMode,
    sharedComponentBypass: ValidationMode,
    unknownBehavioralValues: ValidationMode,
  }),
}).superRefine((manifest, context) => {
  const evidence = [...manifest.tokens, ...manifest.components, ...manifest.rules]
  if (new Set(evidence).size !== evidence.length) {
    context.addIssue({
      code: 'custom',
      message: 'A source path may have only one design-system role',
    })
  }
})

export type DesignSystemManifest = z.infer<typeof DesignSystemManifestSchema>
