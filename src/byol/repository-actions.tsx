import { useState } from 'react'
import type { ApprovedDesignSystem, DesignSystemManifest, DesignSystemProposal, RepositoryConnection } from '@byol/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ComponentPicker, type ComponentChoice } from './component-picker'
import { RepositorySetup } from './repository-setup'
import { createSourceDraft, sourceDraftStore } from './source-draft'

async function post<T>(action: string, body: object): Promise<T> {
  const response = await fetch(`/__lab/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(result.error ?? 'Repository request failed')
  return result
}

export function RepositoryActions() {
  const [stored] = useState(() => {
    if (typeof sessionStorage === 'undefined') return undefined
    try { return JSON.parse(sessionStorage.getItem('byol.connected-repository') ?? 'null') as { connection: RepositoryConnection; components: ComponentChoice[] } | undefined }
    catch { sessionStorage.removeItem('byol.connected-repository'); return undefined }
  })
  const [connection, setConnection] = useState<RepositoryConnection | undefined>(stored?.connection)
  const [proposal, setProposal] = useState<DesignSystemProposal>()
  const [components, setComponents] = useState<ComponentChoice[]>(stored?.components ?? [])
  const [path, setPath] = useState('')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [approved, setApproved] = useState(Boolean(stored))

  const connect = async () => {
    setError('')
    try {
      const input = /^https:\/\//.test(path) ? { kind: 'github' as const, url: path } : { kind: 'local' as const, path }
      const result = await post<{ connection: RepositoryConnection }>('repository/connect', input)
      const discovered = await post<{ proposal: DesignSystemProposal }>('repository/discover', { connection: result.connection })
      setConnection(result.connection); setProposal(discovered.proposal)
    } catch (cause) { setError((cause as Error).message) }
  }

  const approve = async (manifest: DesignSystemManifest) => {
    if (!connection || !proposal) return
    await post<{ approved: ApprovedDesignSystem }>('repository/approve', { connection, proposal, manifest })
    const listed = await post<{ components: ComponentChoice[] }>('repository/components', { connection })
    setComponents(listed.components); setProposal(undefined); setApproved(true); setOpen(false)
    sessionStorage.setItem('byol.connected-repository', JSON.stringify({ connection, components: listed.components }))
  }

  const select = async (component: ComponentChoice) => {
    if (!connection) return
    const result = await post<{ manifest: Parameters<typeof createSourceDraft>[0]['manifest']; approvedDesignSystem: { repositoryId: string; sourceCommit: string }; controls: Parameters<typeof createSourceDraft>[0]['controls']; issues: Parameters<typeof createSourceDraft>[0]['issues'] }>('draft/create', { connection, componentId: component.id })
    const draft = createSourceDraft(result)
    sourceDraftStore.add(draft)
    location.hash = `#/s/${draft.slug}`
  }

  return (
    <div className="flex items-center gap-2">
      {connection && approved && <><Badge variant="secondary">Design system connected</Badge><ComponentPicker components={components} onSelect={select} /></>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button size="sm" variant={connection ? 'ghost' : 'default'}>{connection ? 'Change' : 'Connect design system'}</Button></DialogTrigger>
        <DialogContent>
          {proposal ? <div className="p-5"><RepositorySetup proposal={proposal} onApprove={approve} /></div> : (
            <div className="flex flex-col gap-4 p-5">
              <div className="flex flex-col gap-1 pr-8"><DialogTitle className="text-[15px] font-semibold">Connect design system</DialogTitle><DialogDescription className="text-[13px] text-muted-foreground">Use a local repository path or credential-free GitHub URL.</DialogDescription></div>
              <Input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/path/to/repository or https://github.com/…" />
              {error && <p className="text-[12px] text-destructive">{error}</p>}
              <Button className="self-end" onClick={() => void connect()} disabled={!path.trim()}>Review repository</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
