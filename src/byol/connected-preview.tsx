import { useSyncExternalStore } from 'react'
import { sourceDraftStore } from './source-draft'

export function ConnectedPreview({ draftId }: { draftId: string }) {
  const drafts = useSyncExternalStore(sourceDraftStore.subscribe, sourceDraftStore.snapshot, sourceDraftStore.snapshot)
  const draft = drafts.find((item) => item.id === draftId)
  if (!draft) return null
  const name = draft.manifest.name.toLowerCase()
  const disabled = Boolean(draft.values.disabled)
  const style = Object.fromEntries(draft.manifest.tokens.map((binding) => [`--source-${binding.property}`, String(draft.values[binding.property] ?? binding.token)]))
  return (
    <div data-source-repository={draft.repositoryId} data-source-commit={draft.designSystemCommit} style={style} className="flex flex-col items-center gap-4">
      {name.includes('input') ? <input aria-label={draft.manifest.name} disabled={disabled} placeholder={String(draft.values.placeholder ?? 'Enter text…')} className="h-10 min-w-64 rounded-[var(--source-borderRadius,12px)] border border-[var(--source-borderColor,currentColor)] bg-transparent px-3 text-[14px] outline-none" />
        : name.includes('checkbox') ? <input aria-label={draft.manifest.name} type="checkbox" disabled={disabled} defaultChecked={Boolean(draft.values.checked)} className="size-5" />
          : <button disabled={disabled} className="min-h-9 rounded-[var(--source-borderRadius,10px)] border border-[var(--source-borderColor,currentColor)] px-4 text-[14px]">{draft.manifest.name}</button>}
      <span className="font-mono text-[11px] text-muted-foreground">Source draft · {draft.manifest.source.path}</span>
    </div>
  )
}
