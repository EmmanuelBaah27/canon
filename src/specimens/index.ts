import { createElement, useSyncExternalStore, type ComponentType } from 'react'
import type { Kind } from './kinds'
import { ConnectedPreview } from '@/byol/connected-preview'
import { sourceDraftStore, type SourceDraft } from '@/byol/source-draft'

export type Specimen = {
  slug: string
  kind: Kind
  name: string
  hint: string
  idea: string
  width: number
  height: number
  films: string[]
  bleed?: boolean
  Component: ComponentType
  draft?: { date: string; ingredients: string[] }
  sourceDraft?: SourceDraft
}

export const specimens = Object.values(import.meta.glob<Specimen>('./*/index.ts', { eager: true, import: 'specimen' }))

export const drafts = Object.values(import.meta.glob<Specimen>('../drafts/*/index.ts', { eager: true, import: 'specimen' })).sort((a, b) =>
  (b.draft?.date ?? '').localeCompare(a.draft?.date ?? ''),
)

export const everything = [...specimens, ...drafts]

const sourceSpecimen = (sourceDraft: SourceDraft): Specimen => ({
  slug: sourceDraft.slug, kind: 'component', name: sourceDraft.manifest.name,
  hint: 'Connected source component', idea: `Shape ${sourceDraft.manifest.name} from ${sourceDraft.manifest.repositoryId}.`,
  width: 720, height: 420, films: [],
  Component: () => createElement(ConnectedPreview, { draftId: sourceDraft.id }),
  draft: { date: sourceDraft.createdAt, ingredients: ['connected source', 'design-system tokens'] }, sourceDraft,
})

export function useEverything(): Specimen[] {
  const connected = useSyncExternalStore(sourceDraftStore.subscribe, sourceDraftStore.snapshot, sourceDraftStore.snapshot)
  return [...everything, ...connected.map(sourceSpecimen)]
}

export const isDraft = (specimen: Specimen) => drafts.includes(specimen) || specimen.sourceDraft?.status === 'temporary'

export const findSpecimen = (slug: string) => everything.find((specimen) => specimen.slug === slug)
