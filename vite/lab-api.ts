import type { ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import type {
  ApprovedDesignSystem,
  DesignSystemManifest,
  DesignSystemProposal,
  RepositoryConnection,
} from '../packages/core/src/schemas.ts'
import { keep, toss } from '../scripts/verdict.mjs'

interface RepositoryApi {
  connectRepository: (
    input: { kind: 'local'; path: string } | { kind: 'github'; url: string },
    options: { projectRoot: string },
  ) => Promise<RepositoryConnection>
  discoverDesignSystem: (connection: RepositoryConnection) => Promise<DesignSystemProposal>
  approveDesignSystemProposal: (input: {
    connection: RepositoryConnection
    proposal: DesignSystemProposal
    manifest: DesignSystemManifest
  }) => Promise<ApprovedDesignSystem>
  discoverComponents: (connection: RepositoryConnection) => Promise<Array<{ id: string; name: string; source: { path: string } }>>
  buildComponentManifest: (componentId: string) => Promise<import('../packages/core/src/schemas.ts').ComponentManifest>
  getApprovedDesignSystem: (repositoryId: string) => ApprovedDesignSystem | undefined
  readComponentEvidence: (connection: RepositoryConnection, componentId: string) => Promise<Record<string, string>>
}

interface RuntimeApi {
  extractPublicProperties: (source: string, exportName: string) => unknown[]
  deriveControls: (manifest: import('../packages/core/src/schemas.ts').ComponentManifest, properties?: readonly unknown[]) => { controls: unknown[]; issues: import('../packages/core/src/schemas.ts').Issue[] }
  validateDesignContract: (input: Record<string, unknown>) => import('../packages/core/src/schemas.ts').DesignFinding[]
  findingToIssue: (finding: import('../packages/core/src/schemas.ts').DesignFinding) => import('../packages/core/src/schemas.ts').Issue
}

const send = (res: ServerResponse, status: number, body: object) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

export function labApi(root: string): Plugin {
  return {
    name: 'lab-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__lab', async (req, res) => {
        if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
        let body = ''
        for await (const chunk of req) body += chunk
        const payload = JSON.parse(body || '{}') as Record<string, unknown>
        const action = req.url?.replace(/^\//, '')
        try {
          if (action === 'keep') return send(res, 200, keep(root, String(payload.slug ?? '')))
          if (action === 'toss') return send(res, 200, toss(root, String(payload.slug ?? ''), typeof payload.reason === 'string' ? payload.reason : undefined))
          if (action === 'repository/connect') {
            const { connectRepository } = await server.ssrLoadModule('/packages/repository/src/index.ts') as RepositoryApi
            const connection = await connectRepository(payload as Parameters<typeof connectRepository>[0], { projectRoot: root })
            return send(res, 200, { connection })
          }
          if (action === 'repository/discover') {
            const { discoverDesignSystem } = await server.ssrLoadModule('/packages/repository/src/index.ts') as RepositoryApi
            const proposal = await discoverDesignSystem(payload.connection as RepositoryConnection)
            return send(res, 200, { proposal })
          }
          if (action === 'repository/approve') {
            const { approveDesignSystemProposal } = await server.ssrLoadModule('/packages/repository/src/index.ts') as RepositoryApi
            const approved = await approveDesignSystemProposal({
              connection: payload.connection as RepositoryConnection,
              proposal: payload.proposal as DesignSystemProposal,
              manifest: payload.manifest as DesignSystemManifest,
            })
            return send(res, 200, { approved })
          }
          if (action === 'repository/components') {
            const repository = await server.ssrLoadModule('/packages/repository/src/index.ts') as RepositoryApi
            const connection = payload.connection as RepositoryConnection
            const approved = repository.getApprovedDesignSystem(connection.id)
            if (!approved) throw new Error('Approve the connected design system before listing components')
            const discovered = await repository.discoverComponents(connection)
            const components = discovered.filter((component) => approved.manifest.components.some((root) => component.source.path === root || component.source.path.startsWith(`${root}/`)))
            return send(res, 200, { components })
          }
          if (action === 'draft/create') {
            const repository = await server.ssrLoadModule('/packages/repository/src/index.ts') as RepositoryApi
            const runtime = await server.ssrLoadModule('/packages/runtime/src/index.ts') as RuntimeApi
            const connection = payload.connection as RepositoryConnection
            const approved = repository.getApprovedDesignSystem(connection.id)
            if (!approved) throw new Error('Approve the connected design system before creating a draft')
            const manifest = await repository.buildComponentManifest(String(payload.componentId ?? ''))
            const sources = await repository.readComponentEvidence(connection, manifest.id)
            const properties = runtime.extractPublicProperties(sources[manifest.source.path] ?? '', manifest.source.exportName)
            const derived = runtime.deriveControls(manifest, properties)
            const findings = runtime.validateDesignContract({
              repositoryId: connection.id, sourceCommit: manifest.source.commit, draftId: manifest.id, draftRevision: 0,
              componentId: manifest.id, componentPath: manifest.source.path, sources, manifest: approved.manifest,
              tokenNames: manifest.tokens.map((binding) => binding.token), behavioralRules: {},
            })
            const issues = [...derived.issues, ...findings.map(runtime.findingToIssue)]
            if (!/checkbox/i.test(manifest.name)) issues.push({
              id: `preview-reconstruction:${manifest.id}`, draftId: manifest.id, draftRevision: 0,
              type: 'validation', severity: 'blocker', target: { kind: 'component', id: manifest.id },
              message: 'This component needs a reviewed source reconstruction before integration.',
              resolutionActions: ['review-source'], createdAt: new Date().toISOString(),
            })
            return send(res, 200, { manifest, approvedDesignSystem: { repositoryId: approved.repositoryId, sourceCommit: approved.sourceCommit }, controls: derived.controls, issues })
          }
          send(res, 404, { error: `Unknown action "${action}"` })
        } catch (error) {
          send(res, (error as { status?: number }).status ?? 500, { error: (error as Error).message })
        }
      })
    },
  }
}
