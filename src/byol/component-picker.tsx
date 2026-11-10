import { SearchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

export interface ComponentChoice { id: string; name: string; source: { path: string } }

export function ComponentPicker({ components, onSelect, disabled = false }: {
  components: ComponentChoice[]
  onSelect: (component: ComponentChoice) => void | Promise<void>
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const shown = useMemo(() => components.filter((component) => `${component.name} ${component.source.path}`.toLowerCase().includes(query.toLowerCase())), [components, query])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" disabled={disabled}>New component draft</Button></DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-1 px-5 pt-5 pr-12">
          <DialogTitle className="text-[15px] font-semibold">Select a component</DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground">Create a temporary draft from the connected design system.</DialogDescription>
        </div>
        <div className="relative px-3 pt-4">
          <SearchIcon className="pointer-events-none absolute top-6 left-5 size-4 text-muted-foreground" />
          <Input autoFocus aria-label="Search components" placeholder="Search components…" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-8" />
        </div>
        <div role="listbox" aria-label="Components" className="max-h-(--spacing-picker-list-max) overflow-y-auto p-3">
          {shown.map((component) => (
            <button key={component.id} role="option" className="flex w-full items-center justify-between gap-4 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none hover:bg-muted focus-visible:bg-muted" onClick={() => { void onSelect(component); setOpen(false) }}>
              <span className="font-medium">{component.name}</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">{component.source.path}</span>
            </button>
          ))}
          {!shown.length && <p className="px-2.5 py-8 text-center text-[13px] text-muted-foreground">No matching components.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
