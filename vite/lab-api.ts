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
          send(res, 404, { error: `Unknown action "${action}"` })
        } catch (error) {
          send(res, (error as { status?: number }).status ?? 500, { error: (error as Error).message })
        }
      })
    },
  }
}
