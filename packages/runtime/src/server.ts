import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import type { RepositoryConnection, ComponentManifest } from "@byol/core";
import {
  connectRepository,
  discoverComponents,
  buildComponentManifest,
  readComponentEvidence,
  parseCssSource,
} from "@byol/repository";
import { DraftService, type OverrideResolution } from "./drafts";
import { deriveControls } from "./control-derivation";
import {
  extractPublicProperties,
  extractTokenValues,
  extractVisualBindings,
  deriveCheckboxPreview,
} from "./source-evidence";
import type { RuntimeState } from "./protocol";
function unresolvedTokenBindings(source: ComponentManifest, canonical: ComponentManifest, inline: readonly { property: string; token: string }[] | undefined, values: Record<string, unknown>): string[] {
  const missing = (inline ?? []).filter((entry) => !source.tokens.some((binding) => binding.property === entry.property && binding.token === entry.token)).map((entry) => entry.token);
  return [...missing, ...source.tokens.flatMap((binding, index) => {
    const token = canonical.tokens[index]?.token;
    const isInline = inline?.some((entry) => entry.property === binding.property && entry.token === binding.token);
    const unsupported = !token || (isInline ? !Object.hasOwn(values, token) && !token.includes('var(') : binding.token.includes('var(') && !token.includes('var('));
    return unsupported ? [token ?? binding.token] : [];
  })];
}
export interface RuntimeCommandContext {
  drafts: DraftService;
  connection?: RepositoryConnection;
  stop: () => void;
}
export interface RuntimeOptions {
  commandHandler?: (path: string, body: Record<string, unknown>, context: RuntimeCommandContext) => Promise<unknown>;
  projectRoot: string;
  recoverySessionId?: string;
  port?: number;
  idleTimeoutMs?: number;
  canvasRoot?: string;
}
export async function startByolRuntime(options: RuntimeOptions) {
  const sessionToken = randomBytes(32).toString("hex");
  const drafts = await DraftService.open({
    projectRoot: options.projectRoot,
    sessionId: options.recoverySessionId ?? randomBytes(16).toString("hex"),
  });
  let connection: RepositoryConnection | undefined;
  let components: { id: string; name: string; source: { path: string } }[] = [];
  const evidence = new Map<string, Record<string, string>>();
  let url = "";
  let timer: ReturnType<typeof setTimeout>;
  let stopping: Promise<void> | undefined;
  let finish!: () => void;
  const closed = new Promise<void>((resolve) => (finish = resolve));
  let vite:
    | Awaited<ReturnType<(typeof import("vite"))["createServer"]>>
    | undefined;
  const state = (): RuntimeState => ({
    connection,
    components,
    drafts: drafts.listDrafts().map((draft) => {
      const manifest = drafts.getCanonicalManifest(draft.id);
      const source = evidence.get(manifest.id) ?? {};
      const sourceManifest = drafts.getSourceManifest(draft.id);
      const shape = deriveCheckboxPreview(
        source[manifest.source.path] ?? "",
        manifest.source.path,
        manifest.assets.map((asset) => asset.path),
        manifest.source.exportName,
        source,
      );
      const tokenValues = extractTokenValues(source, manifest.source.path);
      const preview = unresolvedTokenBindings(sourceManifest, manifest, shape?.inlineBindings, tokenValues).length ? undefined : shape;
      const visualBindings = [
        ...extractVisualBindings(
          Object.fromEntries(
            Object.entries(source).filter(([path]) => path.endsWith(".css")),
          ),
          parseCssSource,
        ),
        ...(preview?.inlineBindings ?? []),
      ];
      const editableBindings = manifest.tokens.filter((_binding, index) =>
        visualBindings.some(
          (visual) =>
            visual.property === sourceManifest.tokens[index]?.property &&
            visual.token === sourceManifest.tokens[index]?.token,
        ),
      );
      const controls = deriveControls(
        manifest,
        extractPublicProperties(
          source[manifest.source.path] ?? "",
          manifest.source.exportName,
        ),
        editableBindings,
        sourceManifest.tokens,
      )
        .controls.filter((control) => {
          if (control.id === "checked" || control.id === "disabled")
            return preview?.forwardedStates.includes(control.id) ?? false;
          if (control.id === "preview-state") return Boolean(preview);
          return true;
        })
        .map((control) =>
          control.id === "preview-state"
            ? {
                ...control,
                options: control.options?.filter(
                  (state) =>
                    state === "default" ||
                    preview?.forwardedStates.some(
                      (forwarded) => forwarded === state,
                    ),
                ),
              }
            : control,
        );
      return {
        draft,
        manifest,
        launchUrl: `${url}/#${new URLSearchParams({ session: sessionToken, draft: draft.id })}`,
        controls,
        values: drafts.getPreviewValues(draft.id),
        overrides: drafts.getOverrides(draft.id),
        ready: drafts.isIntegrationReady(draft.id),
        source,
        tokenValues,
        sourceManifest: drafts.getSourceManifest(draft.id),
        preview,
        inlineBindings: preview?.inlineBindings ?? [],
      };
    }),
    issues: drafts.issues.list(),
  });
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  };
  const readBody = async (req: IncomingMessage) => {
    if (req.headers["content-type"] !== "application/json")
      throw new Error("Expected application/json");
    let text = "";
    for await (const chunk of req) {
      text += chunk;
      if (Buffer.byteLength(text) > 65536) throw new Error("Request too large");
    }
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Expected request object");
    return value as Record<string, unknown>;
  };
  const addEvidenceIssues = (draftId: string) => {
    const manifest = drafts.getSourceManifest(draftId);
    const source = evidence.get(manifest.id) ?? {};
    const derived = deriveControls(
      manifest,
      extractPublicProperties(
        source[manifest.source.path] ?? "",
        manifest.source.exportName,
      ),
    );
    const activeIds = new Set(
      derived.issues.map((issue) => `${draftId}:${issue.id}`),
    );
    for (const issue of drafts.issues.list({ draftId }))
      if (
        issue.id.startsWith(`${draftId}:evidence:`) &&
        !activeIds.has(issue.id)
      )
        drafts.issues.resolve(issue.id);
    for (const issue of derived.issues)
      drafts.issues.add({ ...issue, id: `${draftId}:${issue.id}`, draftId });
    const values = drafts.getPreviewValues(draftId);
    for (const control of derived.controls.filter(
      (control) => control.structural,
    )) {
      const id = `structural:${draftId}:${control.id}`;
      if (
        Object.hasOwn(values, control.id) &&
        values[control.id] !== control.defaultValue
      )
        drafts.issues.add({
          id,
          draftId,
          type: "validation",
          severity: "blocker",
          target: { kind: "property", id: control.id },
          message:
            "Structural change requires migration and expanded verification.",
          resolutionActions: ["review-migration"],
          createdAt: new Date().toISOString(),
        });
      else drafts.issues.resolve(id);
    }
    const previewShape = deriveCheckboxPreview(
      source[manifest.source.path] ?? "", manifest.source.path, manifest.assets.map((asset) => asset.path), manifest.source.exportName, source,
    );
    const tokenValues = extractTokenValues(source, manifest.source.path);
    const unresolved = unresolvedTokenBindings(manifest, drafts.getCanonicalManifest(draftId), previewShape?.inlineBindings, tokenValues);
    if (unresolved.length) drafts.issues.add({
      id: `token-evidence:${draftId}`, draftId, type: "validation", severity: "blocker",
      target: { kind: "component", id: manifest.id },
      message: `Token values require supported local literal evidence: ${unresolved.join(", ")}`,
      resolutionActions: ["review-source"], createdAt: new Date().toISOString(),
    });
    else drafts.issues.resolve(`token-evidence:${draftId}`);
    if (
      !deriveCheckboxPreview(
        source[manifest.source.path] ?? "",
        manifest.source.path,
        manifest.assets.map((asset) => asset.path),
        manifest.source.exportName,
        source,
      )
    )
      drafts.issues.add({
        id: `preview:${draftId}`,
        draftId,
        type: "validation",
        severity: "blocker",
        target: { kind: "component", id: manifest.id },
        message:
          "This component needs a reviewed preview reconstruction before approval.",
        resolutionActions: ["review-source"],
        createdAt: new Date().toISOString(),
      });
    else drafts.issues.resolve(`preview:${draftId}`);
  };
  for (const draft of drafts.listDrafts()) addEvidenceIssues(draft.id);
  const server = createServer(async (req, res) => {
    if (req.headers.host !== new URL(url).host) {
      json(res, 403, { error: "Untrusted Host" });
      return;
    }
    if (!req.url?.startsWith("/api/")) {
      if (vite) {
        vite.middlewares(req, res, () =>
          json(res, 404, { error: "Not found" }),
        );
      } else json(res, 404, { error: "Not found" });
      return;
    }
    const auth = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${sessionToken}`);
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) {
      json(res, 401, { error: "Session authentication required" });
      return;
    }
    if (req.headers.origin !== url) {
      json(res, 403, { error: "Untrusted Origin" });
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(
      () => void stop(),
      options.idleTimeoutMs ?? 30 * 60 * 1000,
    );
    timer.unref();
    try {
      if (req.url === "/api/state" && req.method === "GET") {
        json(res, 200, state());
        return;
      }
      if (req.method !== "POST") {
        json(res, 405, { error: "Method not allowed" });
        return;
      }
      const body = await readBody(req);
      if (req.url === "/api/state") {
        json(res, 200, state());
        return;
      }
      const draftId = typeof body.draftId === "string" ? body.draftId : "";
      if (req.url === "/api/connect") {
        const input =
          typeof body.path === "string"
            ? { kind: "local" as const, path: body.path }
            : typeof body.url === "string"
              ? { kind: "github" as const, url: body.url }
              : undefined;
        if (!input) throw new Error("Repository path or URL required");
        const next = await connectRepository(input, {
          projectRoot: options.projectRoot,
        });
        const found = await discoverComponents(next);
        const snapshots = new Map<string, Record<string, string>>();
        for (const component of found)
          snapshots.set(
            component.id,
            await readComponentEvidence(next, component.id),
          );
        connection = next;
        components = found;
        for (const [id, source] of snapshots) evidence.set(id, source);
        for (const issue of drafts.issues
          .list()
          .filter((i) => i.id === "connection"))
          drafts.issues.resolve(issue.id);
        for (const draft of drafts.listDrafts()) {
          addEvidenceIssues(draft.id);
          if (components.some((c) => c.id === draft.componentManifestId)) {
            drafts.issues.resolve(`source:${draft.id}`);
            continue;
          }
          drafts.issues.add({
            id: `source:${draft.id}`,
            draftId: draft.id,
            type: "source-update",
            severity: "blocker",
            target: { kind: "component", id: draft.componentManifestId },
            message:
              "Kept draft source differs from this connection; review the pinned source before approval.",
            resolutionActions: ["review-source"],
            createdAt: new Date().toISOString(),
          });
        }
      } else if (req.url === "/api/drafts/create") {
        if (
          typeof body.componentId !== "string" ||
          !components.some((c) => c.id === body.componentId)
        )
          throw new Error("Unknown active component");
        const draft = await drafts.createDraft(
          await buildComponentManifest(body.componentId),
        );
        addEvidenceIssues(draft.id);
        const selection = new URLSearchParams({ session: sessionToken, draft: draft.id });
        json(res, 200, { ...state(), openedDraftId: draft.id, launchUrl: `${url}/#${selection}` });
        return;
      } else if (req.url === "/api/drafts/keep")
        await drafts.keepDraft(draftId);
      else if (req.url === "/api/drafts/close")
        await drafts.closeDraft(draftId);
      else if (req.url === "/api/drafts/override") {
        const current = state().drafts.find((d) => d.draft.id === draftId);
        const control = current?.controls.find(
          (c) => c.id === body.target && c.control === "token",
        );
        if (!control || typeof body.value !== "string")
          throw new Error("Override requires an evidenced token control");
        await drafts.applyOverride(draftId, {
          target: control.id,
          category: control.category!,
          value: body.value,
        });
      } else if (req.url === "/api/drafts/resolve") {
        if (
          typeof body.overrideId !== "string" ||
          !body.resolution ||
          typeof body.resolution !== "object"
        )
          throw new Error("Invalid resolution");
        await drafts.resolveOverride(
          draftId,
          body.overrideId,
          body.resolution as OverrideResolution,
        );
        addEvidenceIssues(draftId);
      } else if (req.url === "/api/drafts/control") {
        const current = state().drafts.find((d) => d.draft.id === draftId);
        const control = current?.controls.find((c) => c.id === body.target);
        if (!control) throw new Error("Unknown evidenced control");
        const value = body.value;
        if (control.control === "token") {
          if (typeof value !== "string" || !control.tokens?.includes(value))
            throw new Error(
              "Use a canonical token or an explicit preview override",
            );
          const override = await drafts.applyOverride(draftId, {
            target: control.id,
            category: control.category!,
            value,
          });
          await drafts.resolveOverride(draftId, override.id, {
            action: "replace-with-existing-token",
            token: value,
          });
        } else {
          if (
            control.control === "switch"
              ? typeof value !== "boolean"
              : control.options
                ? !control.options.includes(String(value))
                : control.control === "slider" || control.control === "number"
                  ? typeof value !== "number" ||
                    !Number.isFinite(value) ||
                    (control.min !== undefined && value < control.min) ||
                    (control.max !== undefined && value > control.max)
                  : typeof value !== "string"
          )
            throw new Error("Invalid control value");
          await drafts.setPreviewValue(draftId, control.id, value);
        }
        addEvidenceIssues(draftId);
      } else {
        const result = await options.commandHandler?.(req.url, body, {
          drafts, connection, stop: () => { setImmediate(() => void stop()); },
        });
        if (result === undefined) json(res, 404, { error: "Not found" });
        else json(res, 200, result);
        return;
      }
      json(res, 200, state());
    } catch (error) {
      if (req.url === "/api/connect")
        drafts.issues.add({
          id: "connection",
          type: "information",
          severity: "warning",
          target: { kind: "repository", id: "connection" },
          message:
            "Repository connection failed. Check the path or URL and reconnect.",
          resolutionActions: ["retry-connection"],
          createdAt: new Date().toISOString(),
        });
      json(res, 400, {
        error: error instanceof Error ? error.message : "Request failed",
      });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function stop() {
    return (stopping ??= (async () => {
      clearTimeout(timer);
      server.closeIdleConnections();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await vite?.close();
      await drafts.closeSession();
      finish();
    })());
  }
  try {
    if (options.canvasRoot) {
      const { createServer } = await import("vite");
      vite = await createServer({
        root: options.canvasRoot,
        configFile: false,
        logLevel: "error",
        appType: "spa",
        resolve: { dedupe: ["react", "react-dom"] },
        server: {
          middlewareMode: true,
          hmr: false,
          ws: false,
          cors: false,
          fs: {
            strict: true,
            allow: [
              options.canvasRoot,
              resolve(options.canvasRoot, "../../packages/ui"),
              resolve(options.canvasRoot, "../../node_modules"),
            ],
            deny: ["**/.byol/**", "**/.git/**", "**/.env*", "**/*.{crt,pem}"],
          },
        },
        ssr: { noExternal: [/^@byol\//] },
      });
    }
  } catch (error) {
    await stop();
    throw error;
  }
  timer = setTimeout(
    () => void stop(),
    options.idleTimeoutMs ?? 30 * 60 * 1000,
  );
  timer.unref();
  return {
    url,
    launchUrl: `${url}/#session=${sessionToken}`,
    sessionToken,
    stop,
    closed,
  };
}
