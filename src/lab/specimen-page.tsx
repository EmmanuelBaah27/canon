import { ArrowLeftIcon, ClapperboardIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { DialRoot } from 'dialkit'
import 'dialkit/styles.css'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useEverything, type Specimen } from '@/specimens'
import { IssuesRail } from '@/byol/issues-rail'
import { SourceDialkit } from '@/byol/dialkit'
import { sourceDraftStore } from '@/byol/source-draft'
import { DraftVerdict } from './draft-verdict'
import { AnatomyOverlay, type AnatomyMode } from './anatomy-overlay'
import { Hint, Label, ThemeToggle } from './chrome'
import { FitFrame } from './fit-frame'
import { isTypingTarget, useTheme } from './hooks'

const modes: AnatomyMode[] = ['ui', 'skeleton', 'guides']
const modeLabels: Record<AnatomyMode, string> = { ui: 'UI', skeleton: 'Skeleton', guides: 'Guides' }

export function SpecimenPage({ specimen }: { specimen: Specimen }) {
  const [mode, setMode] = useState<AnatomyMode>('ui')
  const { dark } = useTheme()
  const specimens = useEverything()
  const index = specimens.findIndex((item) => item.slug === specimen.slug)
  const { Component } = specimen
  const updateSourceValues = useCallback((values: Record<string, unknown>) => {
    if (specimen.sourceDraft) sourceDraftStore.updateValues(specimen.sourceDraft.id, values)
  }, [specimen.sourceDraft])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return
      const key = event.key.toLowerCase()
      const step = (delta: number) => (location.hash = `#/s/${specimens[(index + delta + specimens.length) % specimens.length].slug}`)
      if (event.key === 'ArrowRight') step(1)
      else if (event.key === 'ArrowLeft') step(-1)
      else if (event.key === 'Escape') location.hash = ''
      else if (key === 'g' && specimen.kind === 'breakdown') setMode((current) => modes[(modes.indexOf(current) + 1) % modes.length])
      else return
      event.preventDefault()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [index, specimen.kind, specimens])

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr_auto]">
      <header className="flex h-14 items-center gap-3 px-4">
        <Hint label="Back to the lab" keys="Esc">
          <Button variant="ghost" size="sm" asChild>
            <a href="#/">
              <ArrowLeftIcon data-icon="inline-start" />
              Lab
            </a>
          </Button>
        </Hint>
        <Separator orientation="vertical" className="h-4!" />
        <h1>
          <Label>{specimen.name}</Label>
        </h1>
        <span className="truncate text-[13px] text-muted-foreground">{specimen.idea}</span>
        <div className="ml-auto flex items-center gap-2">
          {specimen.kind === 'breakdown' && (
          <Hint label="Cycle anatomy" keys="G">
            <ToggleGroup type="single" variant="segmented" size="sm" spacing={0} value={mode} onValueChange={(value) => value && setMode(value as AnatomyMode)} aria-label="Anatomy view">
              {modes.map((value) => (
                <ToggleGroupItem key={value} value={value} className="px-3">
                  {modeLabels[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Hint>
          )}
          {specimen.films.map((film) => (
            <Button key={film} variant="outline" size="sm" asChild>
              <a href={`/film.html?film=${film}&theme=${dark ? 'dark' : 'light'}&from=${specimen.slug}`}>
                <ClapperboardIcon data-icon="inline-start" />
                Film
              </a>
            </Button>
          ))}
          {specimen.sourceDraft?.status === 'temporary' && <DraftVerdict specimen={specimen} />}
          <ThemeToggle />
        </div>
      </header>

      <main className="relative grid min-h-0">
        {specimen.sourceDraft && <IssuesRail issues={specimen.sourceDraft.issues} />}
        <FitFrame
          width={specimen.width}
          height={specimen.height}
          padding={specimen.bleed ? 0 : 48}
          className={cn('mx-3 rounded-[20px] shadow-inset', specimen.bleed ? 'bg-background' : 'bg-canvas dot-field')}
        >
          <AnatomyOverlay key={specimen.slug} mode={mode}>
            <Component />
          </AnatomyOverlay>
        </FitFrame>
      </main>

      <aside aria-label="Tuning">
        {specimen.sourceDraft && <SourceDialkit draftId={specimen.sourceDraft.id} name={specimen.name} controls={specimen.sourceDraft.controls} onChange={updateSourceValues} />}
        <DialRoot position="bottom-right" theme={dark ? "dark" : "light"} />
      </aside>
      <footer className="flex h-11 items-center px-5 font-mono text-[11px] text-muted-foreground tabular">
        {index + 1} of {specimens.length}, {specimen.name.toLowerCase()}{specimen.kind === 'breakdown' ? `, ${modeLabels[mode].toLowerCase()}` : ''}
        <span className="ml-auto">← → specimens{specimen.kind === 'breakdown' ? ' · G anatomy' : ''} · T theme</span>
      </footer>
    </div>
  )
}
