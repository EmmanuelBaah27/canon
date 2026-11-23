import { CheckIcon, ClipboardIcon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

type TasteReviewStatus = {
  total: number
  reviewed: number
  pending: number
  due: boolean
  entries: string[]
}

const loadStatus = async () => {
  const response = await fetch('/__lab/taste-review')
  if (!response.ok) throw new Error('Could not load Mande taste review status.')
  return response.json() as Promise<TasteReviewStatus>
}

export function TasteReviewPrompt() {
  const [status, setStatus] = useState<TasteReviewStatus>()
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadStatus().then(setStatus).catch((reason: Error) => setError(reason.message))
  }, [])

  const prompt = useMemo(() => {
    if (!status) return ''
    return [
      'Review these recent Mande design judgments.',
      'Propose only reusable taste rules supported by the evidence.',
      'Do not edit TASTE.md until I approve each rule.',
      '',
      ...status.entries,
    ].join('\n')
  }, [status])

  if (!status?.due || hidden) return null

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
    } catch {
      setError('Could not copy the agent prompt.')
    }
  }

  const markReviewed = async () => {
    const response = await fetch('/__lab/mark-taste-reviewed', { method: 'POST' })
    if (!response.ok) {
      setError('Could not mark these judgments as reviewed.')
      return
    }
    setStatus((await response.json()) as TasteReviewStatus)
  }

  return (
    <section className="rounded-[24px] bg-card p-6 shadow-raised" aria-labelledby="taste-review-title">
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 id="taste-review-title" className="text-[14px] font-medium">
            {status.pending} new Mande judgments
          </h2>
          <p className="text-[12px] text-muted-foreground">Review the evidence and promote only reusable rules into Mande’s taste guide.</p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => setHidden(true)} aria-label="Review later">
          <XIcon />
        </Button>
      </div>

      <div className="mt-4 flex gap-2">
        <Button type="button" onClick={() => setOpen((value) => !value)}>{open ? 'Hide judgments' : 'Review taste'}</Button>
        <Button type="button" variant="outline" onClick={() => setHidden(true)}>Later</Button>
      </div>

      {open && (
        <div className="mt-6 flex flex-col gap-4">
          <ul className="flex flex-col gap-2 rounded-[16px] bg-muted p-4 text-[12px] text-muted-foreground shadow-inset">
            {status.entries.map((entry) => <li key={entry}>{entry.replace(/^- /, '')}</li>)}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={copyPrompt}>
              {copied ? <CheckIcon /> : <ClipboardIcon />}
              {copied ? 'Prompt copied' : 'Copy agent prompt'}
            </Button>
            <Button type="button" variant="ghost" onClick={markReviewed}>Mark reviewed</Button>
          </div>
          <p className="text-[12px] text-muted-foreground">Paste the prompt into your agent chat. Mande’s TASTE.md changes only after you approve a proposed rule.</p>
        </div>
      )}

      {error && <p role="alert" className="mt-4 text-[12px] text-destructive">{error}</p>}
    </section>
  )
}
