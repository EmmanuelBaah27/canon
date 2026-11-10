import type { ComponentManifest, Issue } from '@byol/core'
import type { DerivedControl } from '../../packages/runtime/src/control-derivation'

export interface SourceDraft {
  id: string
  slug: string
  status: 'temporary' | 'kept'
  revision: number
  repositoryId: string
  designSystemCommit: string
  manifest: ComponentManifest
  controls: DerivedControl[]
  issues: Issue[]
  values: Record<string, unknown>
  behaviors: Record<string, unknown>
  createdAt: string
}

export interface CreateSourceDraftInput {
  manifest: ComponentManifest
  approvedDesignSystem: { repositoryId: string; sourceCommit: string }
  controls: DerivedControl[]
  issues: Issue[]
  values?: Record<string, unknown>
  behaviors?: Record<string, unknown>
  now?: string
}

export function createSourceDraft(input: CreateSourceDraftInput): SourceDraft {
  if (input.manifest.repositoryId !== input.approvedDesignSystem.repositoryId) throw new Error('Component and approved design system belong to different repositories')
  if (input.manifest.source.commit !== input.approvedDesignSystem.sourceCommit) throw new Error('Component source is stale against the approved design system')
  const createdAt = input.now ?? new Date().toISOString()
  const id = `${input.manifest.id}-${createdAt.replace(/\W/g, '').toLowerCase()}`
  return structuredClone({
    id, slug: `source-${input.manifest.id}`, status: 'temporary', revision: 0,
    repositoryId: input.manifest.repositoryId, designSystemCommit: input.approvedDesignSystem.sourceCommit,
    manifest: input.manifest, controls: input.controls,
    issues: input.issues.map((issue) => ({ ...issue, draftId: id, draftRevision: 0 })),
    values: input.values ?? {}, behaviors: input.behaviors ?? {}, createdAt,
  })
}

const storageKey = 'byol.source-drafts.v1'
const listeners = new Set<() => void>()
let memory: SourceDraft[] | undefined

function read(): SourceDraft[] {
  if (memory) return memory
  if (typeof sessionStorage === 'undefined') return (memory = [])
  try { return (memory = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as SourceDraft[]) }
  catch { return (memory = []) }
}

function write(drafts: SourceDraft[]) {
  memory = structuredClone(drafts)
  if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(storageKey, JSON.stringify(memory))
  listeners.forEach((listener) => listener())
}

export const sourceDraftStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) },
  snapshot: () => read(),
  add(draft: SourceDraft) { write([...read().filter((item) => item.id !== draft.id), structuredClone(draft)]) },
  keep(id: string) { write(read().map((draft) => draft.id === id ? { ...draft, status: 'kept' as const, revision: draft.revision + 1 } : draft)) },
  remove(id: string) { write(read().filter((draft) => draft.id !== id)) },
  updateValues(id: string, values: Record<string, unknown>) { write(read().map((draft) => draft.id === id ? { ...draft, values: { ...draft.values, ...values }, revision: draft.revision + 1 } : draft)) },
  resetForTests() { memory = []; if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(storageKey) },
}
