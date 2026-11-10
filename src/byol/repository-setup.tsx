import { useMemo, useState } from 'react'
import type { DesignSystemManifest, DesignSystemProposal } from '@byol/core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { updateManifestPath, type ManifestRole } from './repository-setup-model'

const labels: Record<ManifestRole, string> = {
  tokens: 'Tokens',
  components: 'Components',
  rules: 'Rules',
}

export interface RepositorySetupProps {
  proposal: DesignSystemProposal
  onApprove: (manifest: DesignSystemManifest) => void | Promise<void>
}

export function RepositorySetup({ proposal, onApprove }: RepositorySetupProps) {
  const [manifest, setManifest] = useState(proposal.manifest)
  const [submitting, setSubmitting] = useState(false)
  const evidence = useMemo(() => new Map(proposal.candidates.map((candidate) => [
    `${candidate.role}:${candidate.path}`,
    candidate.evidence.join(' · '),
  ])), [proposal.candidates])

  const approve = async () => {
    setSubmitting(true)
    try { await onApprove(manifest) } finally { setSubmitting(false) }
  }

  return (
    <section aria-labelledby="repository-setup-title" className="flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 id="repository-setup-title" className="text-[15px] font-semibold tracking-[-0.01em]">Review design system</h2>
          <Badge variant="secondary">{proposal.origin === 'manifest' ? 'Manifest found' : 'Inferred'}</Badge>
        </div>
        <p className="text-[14px] text-muted-foreground">Confirm what BYOL should treat as the connected repository’s source of truth.</p>
      </div>

      {proposal.ambiguities.length > 0 && (
        <div className="flex flex-col gap-2" role="status">
          <span className="text-[13px] font-medium">Needs clarification</span>
          {proposal.ambiguities.map((ambiguity) => (
            <div key={ambiguity.path} className="flex items-start justify-between gap-4 py-1 text-[13px]">
              <code className="font-mono text-foreground">{ambiguity.path}</code>
              <span className="text-right text-muted-foreground">Could be {ambiguity.roles.join(' or ')}</span>
            </div>
          ))}
        </div>
      )}

      <Separator />

      <div className="flex flex-col gap-5">
        {(Object.keys(labels) as ManifestRole[]).map((role) => (
          <fieldset key={role} className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-medium">{labels[role]}</legend>
            {manifest[role].length === 0 ? (
              <p className="text-[13px] text-muted-foreground">No {labels[role].toLowerCase()} discovered.</p>
            ) : manifest[role].map((path, index) => (
              <label key={`${role}-${index}`} className="flex flex-col gap-1.5">
                <span className="sr-only">{labels[role]} path {index + 1}</span>
                <Input
                  value={path}
                  onChange={(event) => setManifest((current) => updateManifestPath(current, role, index, event.target.value))}
                  className="font-mono text-[12px]"
                />
                <span className="text-[12px] text-muted-foreground">{evidence.get(`${role}:${path}`) ?? 'Owner correction'}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-4">
        <p className="text-[12px] text-muted-foreground">Approval is bound to commit <code className="font-mono">{proposal.sourceCommit.slice(0, 8)}</code>.</p>
        <Button onClick={approve} disabled={submitting}>{submitting ? 'Approving…' : 'Approve design system'}</Button>
      </div>
    </section>
  )
}
