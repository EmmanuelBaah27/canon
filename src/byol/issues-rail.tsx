import { AlertCircleIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Issue } from '@byol/core'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function IssuesRail({ issues }: { issues: Issue[] }) {
  const [open, setOpen] = useState(() => issues.some((issue) => issue.severity === 'blocker'))
  const [filter, setFilter] = useState<Issue['type'] | 'all'>('all')
  const types = useMemo(() => [...new Set(issues.map((issue) => issue.type))], [issues])
  const visible = filter === 'all' ? issues : issues.filter((issue) => issue.type === filter)
  if (!issues.length) return null
  return (
    <aside aria-label="Draft issues" className={cn('absolute top-3 bottom-3 left-3 z-20 flex overflow-hidden rounded-(--radius-shell) bg-card shadow-floating transition-[width] duration-product', open ? 'w-(--spacing-issue-rail)' : 'w-(--spacing-issue-rail-collapsed)')}>
      {open ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 items-center gap-2 px-3">
            <AlertCircleIcon className="size-4 text-muted-foreground" />
            <span className="text-[13px] font-medium">Issues · {issues.length}</span>
            <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="Collapse issues" onClick={() => setOpen(false)}><ChevronLeftIcon /></Button>
          </div>
          <div className="flex flex-wrap gap-1 px-3 pb-3">
            {(['all', ...types] as const).map((type) => <Button key={type} size="xs" variant={filter === type ? 'secondary' : 'ghost'} onClick={() => setFilter(type)}>{type === 'all' ? 'All' : type.replaceAll('-', ' ')}</Button>)}
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
            {visible.map((issue) => (
              <div key={issue.id} className="flex flex-col gap-1 rounded-xl bg-muted px-3 py-2">
                <span className="text-[12px] font-medium capitalize">{issue.severity}</span>
                <p className="text-[12px] leading-5 text-muted-foreground">{issue.message}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button aria-label={`Expand ${issues.length} issues`} className="flex w-10 flex-col items-center gap-2 py-3 text-muted-foreground hover:text-foreground" onClick={() => setOpen(true)}>
          <ChevronRightIcon className="size-4" /><span className="text-[11px] font-medium tabular">{issues.length}</span>
        </button>
      )}
    </aside>
  )
}
