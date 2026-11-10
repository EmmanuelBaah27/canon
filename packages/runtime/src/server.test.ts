import { it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startByolRuntime } from "./server";
it("binds loopback and requires session auth plus exact Origin without CORS", async () => {
  const root = await mkdtemp(join(tmpdir(), "byol-api-"));
  const runtime = await startByolRuntime({
    projectRoot: root,
    idleTimeoutMs: 10000,
  });
  try {
    expect(new URL(runtime.url).hostname).toBe("127.0.0.1");
    expect((await fetch(runtime.url + "/api/state")).status).toBe(401);
    const headers = {
      Authorization: "Bearer " + runtime.sessionToken,
      Origin: runtime.url,
    };
    expect((await fetch(runtime.url + "/api/state", { headers })).status).toBe(
      200,
    );
    const bad = await fetch(runtime.url + "/api/state", {
      headers: { ...headers, Origin: "http://evil.test" },
    });
    expect(bad.status).toBe(403);
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
    expect(
      (
        await fetch(runtime.url + "/api/state", {
          headers: { Authorization: headers.Authorization },
        })
      ).status,
    ).toBe(403);
  } finally {
    await runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});
it("cleans up automatically after idle timeout", async () => {
  const root = await mkdtemp(join(tmpdir(), "byol-idle-"));
  const runtime = await startByolRuntime({
    projectRoot: root,
    idleTimeoutMs: 30,
  });
  await runtime.closed;
  await expect(fetch(runtime.url + "/api/state")).rejects.toThrow();
  await rm(root, { recursive: true, force: true });
});
it("keeps connection failures in the unified rail until a successful reconnect and enforces override resolution", async () => {
  const { cp, mkdir } = await import("node:fs/promises");
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const root = await mkdtemp(join(tmpdir(), "byol-flow-"));
  const repository = join(root, "mande");
  const project = join(root, "project");
  await mkdir(project);
  await cp(
    fileURLToPath(
      new URL("../../repository/test/fixtures/mande-system", import.meta.url),
    ),
    repository,
    { recursive: true },
  );
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "core.hooksPath=/dev/null", "-C", repository, ...args],
      { stdio: "ignore" },
    );
  git("init", "--initial-branch=main");
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "fixture",
  );
  const runtime = await startByolRuntime({ projectRoot: project });
  const post = async (action: string, body: unknown = {}) =>
    fetch(runtime.url + "/api/" + action, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + runtime.sessionToken,
        Origin: runtime.url,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  try {
    expect(
      (await post("connect", { path: join(root, "missing") })).status,
    ).toBe(400);
    let state = (await (await post("state")).json()) as any;
    expect(state.issues).toHaveLength(1);
    expect(state.issues[0].type).toBe("information");
    state = await (await post("connect", { path: repository })).json();
    expect(state.issues).toHaveLength(0);
    const component = state.components.find((c: any) => c.name === "Checkbox");
    state = await (
      await post("drafts/create", { componentId: component.id })
    ).json();
    const draftId = state.drafts[0].draft.id;
    expect(state.drafts[0].tokenValues["tokens.color.border"]).toBe(
      "var(--mande-color-border)",
    );
    state = await (
      await post("drafts/override", {
        draftId,
        target: "token-binding:0",
        value: "#123456",
      })
    ).json();
    expect(state.issues).toHaveLength(1);
    expect(state.drafts[0].ready).toBe(false);
    expect(state.drafts[0].manifest.tokens[0].token).toBe(
      "tokens.color.border",
    );
    expect(
      (
        await post("drafts/control", {
          draftId,
          target: "token-binding:0",
          value: "#abcdef",
        })
      ).status,
    ).toBe(400);
    const overrideId = state.drafts[0].overrides[0].id;
    state = await (
      await post("drafts/resolve", {
        draftId,
        overrideId,
        resolution: { action: "propose-token" },
      })
    ).json();
    expect(state.issues.some((i: any) => i.severity === "blocker")).toBe(true);
    state = await (
      await post("drafts/resolve", {
        draftId,
        overrideId,
        resolution: { action: "revert" },
      })
    ).json();
    expect(state.issues).toHaveLength(0);
    expect(state.drafts[0].ready).toBe(true);
    state = await (
      await post("drafts/override", {
        draftId,
        target: "token-binding:0",
        value: "red",
      })
    ).json();
    state = await (
      await post("drafts/resolve", {
        draftId,
        overrideId: state.drafts[0].overrides[0].id,
        resolution: {
          action: "replace-with-existing-token",
          token: "var(--mande-color-surface)",
        },
      })
    ).json();
    expect(state.issues).toHaveLength(0);
    expect(
      state.drafts[0].controls.find((c: any) => c.id === "token-binding:0")
        ?.defaultValue,
    ).toBe("var(--mande-color-surface)");
    expect(
      state.drafts[0].controls.find((c: any) => c.id === "token-binding:0")
        ?.tokens,
    ).toContain("tokens.color.border");
    expect(state.drafts[0].sourceManifest.tokens[0].token).toBe(
      "tokens.color.border",
    );
    state = await (await post("drafts/close", { draftId })).json();
    expect(state.drafts).toEqual([]);
  } finally {
    await runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

it("rejects non-ASCII malformed auth without crashing or hanging the local server", async () => {
  const { request } = await import("node:http");
  const root = await mkdtemp(join(tmpdir(), "byol-auth-"));
  const runtime = await startByolRuntime({ projectRoot: root });
  try {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        runtime.url + "/api/state",
        {
          headers: {
            Authorization: "Bearer " + "é".repeat(64),
            Origin: runtime.url,
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.setTimeout(500, () =>
        req.destroy(new Error("Authentication request hung")),
      );
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(401);
  } finally {
    await runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

it("clears reconstruction blockers after keep, stop, restart, and exact source reconnect", async () => {
  const { cp, mkdir } = await import("node:fs/promises");
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const root = await mkdtemp(join(tmpdir(), "byol-reconnect-"));
  const repository = join(root, "mande");
  const project = join(root, "project");
  await mkdir(project);
  await cp(
    fileURLToPath(
      new URL("../../repository/test/fixtures/mande-system", import.meta.url),
    ),
    repository,
    { recursive: true },
  );
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "core.hooksPath=/dev/null", "-C", repository, ...args],
      { stdio: "ignore" },
    );
  git("init", "--initial-branch=main");
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "fixture",
  );
  let runtime = await startByolRuntime({ projectRoot: project });
  const post = async (action: string, body: unknown = {}) => {
    const response = await fetch(runtime.url + "/api/" + action, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + runtime.sessionToken,
        Origin: runtime.url,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    return (await response.json()) as any;
  };
  try {
    let state = await post("connect", { path: repository });
    const componentId = state.components.find(
      (component: any) => component.name === "Checkbox",
    ).id;
    state = await post("drafts/create", { componentId });
    const draftId = state.drafts[0].draft.id;
    await post("drafts/control", { draftId, target: "checked", value: true });
    await post("drafts/keep", { draftId });
    await runtime.stop();
    runtime = await startByolRuntime({ projectRoot: project });
    state = await post("state");
    expect(
      state.issues.some((issue: any) => issue.id === `preview:${draftId}`),
    ).toBe(true);
    expect(state.drafts[0].ready).toBe(false);
    state = await post("connect", { path: repository });
    expect(state.issues).toEqual([]);
    expect(state.drafts[0].ready).toBe(true);
    expect(state.drafts[0].values.checked).toBe(true);
    expect(state.drafts[0].preview.kind).toBe("checkbox");
  } finally {
    await runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

it.each([
  {
    name: "declared disabled omitted from Root",
    source: `export const Checkbox=(props:{checked?:boolean;disabled?:boolean})=><Check.Root checked={props.checked}/>;`,
    supported: false,
  },
  {
    name: "nonliteral checked default",
    source: `export const Checkbox=({checked=!false,disabled=false}:{checked?:boolean;disabled?:boolean})=><Check.Root checked={checked} disabled={disabled}/>;`,
    supported: false,
  },
  {
    name: "checked-only Root ignores unrelated helper disabled state",
    source: `const Helper=()=> <Check.Root disabled/>; export const Checkbox=(props:{checked?:boolean})=><Check.Root checked={props.checked}/>;`,
    supported: true,
    checked: false,
    disabled: undefined,
    states: ["checked"] as ("checked" | "disabled")[],
  },
  {
    name: "literal checked default",
    source: `export const Checkbox=({checked=true,disabled=false}:{checked?:boolean;disabled?:boolean})=><Check.Root checked={checked} disabled={disabled}/>;`,
    supported: true,
    checked: true,
    disabled: false,
  },
  {
    name: "literal disabled default",
    source: `export const Checkbox=({checked=false,disabled=true}:{checked?:boolean;disabled?:boolean})=><Check.Root checked={checked} disabled={disabled}/>;`,
    supported: true,
    checked: false,
    disabled: true,
  },
])(
  "requires proven state behavior in a disposable runtime: $name",
  async (scenario) => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { execFileSync } = await import("node:child_process");
    const root = await mkdtemp(join(tmpdir(), "byol-state-proof-"));
    const repository = join(root, "repository");
    const project = join(root, "project");
    await mkdir(repository);
    await mkdir(project);
    await writeFile(
      join(repository, "Checkbox.tsx"),
      `import * as Check from '@radix-ui/react-checkbox'; ${scenario.source}`,
    );
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        ["-c", "core.hooksPath=/dev/null", "-C", repository, ...args],
        { stdio: "ignore" },
      );
    git("init", "--initial-branch=main");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-m",
      "state proof",
    );
    const runtime = await startByolRuntime({ projectRoot: project });
    const post = async (action: string, body: unknown = {}) => {
      const response = await fetch(runtime.url + "/api/" + action, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + runtime.sessionToken,
          Origin: runtime.url,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(200);
      return (await response.json()) as any;
    };
    try {
      const connected = await post("connect", { path: repository });
      const state = await post("drafts/create", {
        componentId: connected.components.find(
          (component: any) => component.name === "Checkbox",
        ).id,
      });
      const item = state.drafts[0];
      if (scenario.supported) {
        expect(state.issues).toEqual([]);
        expect(item.ready).toBe(true);
        expect(item.preview.forwardedStates).toEqual(
          scenario.states ?? ["checked", "disabled"],
        );
        expect(item.preview.stateDefaults).toEqual({
          checked: scenario.checked,
          disabled: scenario.disabled ?? false,
        });
        expect(
          item.controls.find((control: any) => control.id === "checked")
            .defaultValue,
        ).toBe(scenario.checked);
        if (scenario.disabled === undefined) {
          expect(
            item.controls.find((control: any) => control.id === "disabled"),
          ).toBeUndefined();
          expect(
            item.controls.find((control: any) => control.id === "preview-state")
              ?.options,
          ).not.toContain("disabled");
        } else
          expect(
            item.controls.find((control: any) => control.id === "disabled")
              .defaultValue,
          ).toBe(scenario.disabled);
      } else {
        expect(item.preview).toBeUndefined();
        expect(item.ready).toBe(false);
        expect(
          state.issues.some((issue: any) => issue.severity === "blocker"),
        ).toBe(true);
        expect(
          item.controls.some(
            (control: any) =>
              control.id === "disabled" || control.id === "checked",
          ),
        ).toBe(false);
      }
    } finally {
      await runtime.stop();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it.each([false, true])(
  "keeps Root and wrapper capabilities independent in a disposable runtime: %s",
  async (forwarded) => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { execFileSync } = await import("node:child_process");
    const root = await mkdtemp(join(tmpdir(), "byol-wrapper-proof-"));
    const repository = join(root, "repository");
    const project = join(root, "project");
    await mkdir(repository);
    await mkdir(project);
    await writeFile(
      join(repository, "Checkbox.tsx"),
      `import * as Check from '@radix-ui/react-checkbox'; import {BaseControl} from './BaseControl'; export const Checkbox=({checked=false,disabled=true}:{checked?:boolean;disabled?:boolean})=><BaseControl${forwarded ? " disabled={disabled}" : ""}><Check.Root checked={checked} disabled={disabled}/></BaseControl>;`,
    );
    await writeFile(
      join(repository, "BaseControl.tsx"),
      `export const BaseControl=(props:any)=><div className="control" {...props}/>;`,
    );
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        ["-c", "core.hooksPath=/dev/null", "-C", repository, ...args],
        { stdio: "ignore" },
      );
    git("init", "--initial-branch=main");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-m",
      "wrapper proof",
    );
    const runtime = await startByolRuntime({ projectRoot: project });
    const post = async (action: string, body: unknown = {}) => {
      const response = await fetch(runtime.url + "/api/" + action, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + runtime.sessionToken,
          Origin: runtime.url,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(200);
      return (await response.json()) as any;
    };
    try {
      const connected = await post("connect", { path: repository });
      const state = await post("drafts/create", {
        componentId: connected.components.find(
          (component: any) => component.name === "Checkbox",
        ).id,
      });
      const item = state.drafts[0];
      expect(state.issues).toEqual([]);
      expect(item.ready).toBe(true);
      expect(item.preview.forwardedStates).toEqual(["checked", "disabled"]);
      expect(item.preview.wrapperForwardedStates).toEqual(
        forwarded ? ["disabled"] : [],
      );
      expect(
        item.controls.find((control: any) => control.id === "disabled")
          .defaultValue,
      ).toBe(true);
    } finally {
      await runtime.stop();
      await rm(root, { recursive: true, force: true });
    }
  },
);
